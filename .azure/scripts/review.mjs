import { execSync } from 'child_process';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const REVIEW_CRITERIA = `
Por favor, analiza el siguiente código diff y evalúa:

1. **Potenciales bugs o problemas de lógica**
2. **Implementación de buenas prácticas**
3. **Aspectos de seguridad**
4. **Calidad y mantenibilidad del código**
5. **Optimizaciones posibles**
6. **Consistencia con estándares de código**

Sé específico y proporciona ejemplos concretos cuando sea posible.
Usa formato markdown para una mejor legibilidad.
Si no hay problemas en alguna categoría, indícalo brevemente.

DIFF A ANALIZAR:
`;

const MAX_DIFF_LENGTH = 80_000;

function getDiff() {
  const base = process.env.BASE_SHA;
  const head = process.env.HEAD_SHA;

  try {
    execSync('git fetch origin', { encoding: 'utf-8' });
    const diff = execSync(`git diff origin/${base}...${head}`, {
      encoding: 'utf-8',
    });

    if (!diff.trim()) return null;

    return diff.length > MAX_DIFF_LENGTH
      ? diff.substring(0, MAX_DIFF_LENGTH) + '\n\n[... diff truncado ...]'
      : diff;
  } catch (err) {
    console.error('Error obteniendo el diff:', err.message);
    process.exit(1);
  }
}

async function callClaude(diff) {
  console.log('Llamando a Claude API con streaming...\n');

  const stream = client.messages.stream({
    model: 'claude-opus-4-6',
    max_tokens: 4096,
    thinking: { type: 'adaptive' },
    messages: [
      {
        role: 'user',
        content: REVIEW_CRITERIA + diff,
      },
    ],
  });

  let review = '';

  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta'
    ) {
      review += event.delta.text;
      process.stdout.write(event.delta.text);
    }
  }

  console.log('\n');
  return review;
}

async function postPRComment(review) {
  const { AZURE_DEVOPS_TOKEN, ORGANIZATION, PROJECT, REPO_ID, PR_ID } = process.env;

  const orgUrl = ORGANIZATION.replace(/\/$/, '');

  const body = [
    '## 🤖 AI Code Review — Claude Opus 4.6',
    '',
    review,
    '',
    '---',
    '*Revisión automática generada por [Claude Opus 4.6](https://anthropic.com)*',
  ].join('\n');

  const url = `${orgUrl}/${encodeURIComponent(PROJECT)}/_apis/git/repositories/${REPO_ID}/pullRequests/${PR_ID}/threads?api-version=7.1`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${AZURE_DEVOPS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      comments: [
        {
          parentCommentId: 0,
          content: body,
          commentType: 1,
        },
      ],
      status: 1,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Error al publicar el comentario en el PR:', error);
    process.exit(1);
  }

  const data = await response.json();
  console.log(`✅ Review publicada en PR #${PR_ID} (thread ${data.id})`);
}

async function main() {
  const diff = getDiff();

  if (!diff) {
    console.log('No se detectaron cambios en el diff. Nada que revisar.');
    return;
  }

  const review = await callClaude(diff);
  await postPRComment(review);
}

main().catch((err) => {
  console.error('Error inesperado:', err);
  process.exit(1);
});
