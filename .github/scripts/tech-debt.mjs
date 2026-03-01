import { execSync } from 'child_process';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const DEBT_SCHEMA = {
  type: 'object',
  properties: {
    has_debt: {
      type: 'boolean',
    },
    summary: {
      type: 'string',
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: ['security', 'bug', 'maintainability', 'performance', 'standards'],
          },
          severity: {
            type: 'string',
            enum: ['critical', 'high', 'medium', 'low'],
          },
          description: { type: 'string' },
          file: { type: 'string' },
          suggestion: { type: 'string' },
        },
        required: ['category', 'severity', 'description', 'file', 'suggestion'],
        additionalProperties: false,
      },
    },
  },
  required: ['has_debt', 'summary', 'items'],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `Eres un experto en seguridad y calidad de software.
Analiza el diff de código y detecta deuda técnica según estos criterios:

1. Credenciales o llaves hardcodeadas (API keys, passwords, secrets)
2. Algoritmos de hashing inseguros para contraseñas (MD5, SHA1)
3. Bugs o problemas de lógica
4. Violaciones de buenas prácticas
5. Vulnerabilidades de seguridad (OWASP Top 10)
6. Problemas de mantenibilidad
7. Falta de consistencia con estándares del proyecto

Responde SOLO con el JSON estructurado solicitado. Sé preciso y específico.
Si no hay deuda técnica real, responde con has_debt: false e items vacío.`;

function getDiff() {
  try {
    const diff = execSync('git diff HEAD~1 HEAD', { encoding: 'utf-8' });
    if (!diff.trim()) return null;

    const MAX = 80_000;
    return diff.length > MAX
      ? diff.substring(0, MAX) + '\n\n[... diff truncado ...]'
      : diff;
  } catch (err) {
    console.error('Error obteniendo diff:', err.message);
    process.exit(1);
  }
}

async function analyzeWithClaude(diff) {
  console.log('Analizando código con Claude...');

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 4096,
    thinking: { type: 'adaptive' },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Analiza este diff y devuelve el JSON de deuda técnica:\n\n${diff}`,
      },
    ],
    output_config: {
      format: {
        type: 'json_schema',
        schema: DEBT_SCHEMA,
      },
    },
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  return JSON.parse(textBlock.text);
}

function formatTrelloDescription(analysis) {
  const { summary, items } = analysis;

  const SEVERITY_EMOJI = {
    critical: '🔴',
    high: '🟠',
    medium: '🟡',
    low: '🟢',
  };

  const CATEGORY_LABEL = {
    security: '🔒 Seguridad',
    bug: '🐛 Bug',
    maintainability: '🧹 Mantenibilidad',
    performance: '⚡ Performance',
    standards: '📐 Estándares',
  };

  const commitShort = process.env.COMMIT_SHA?.substring(0, 7) ?? 'unknown';
  const author = process.env.COMMIT_AUTHOR ?? 'unknown';
  const repo = process.env.REPO ?? '';
  const commitMsg = process.env.COMMIT_MESSAGE ?? '';

  const lines = [
    `**Resumen:** ${summary}`,
    '',
    `**Commit:** \`${commitShort}\` — ${commitMsg}`,
    `**Autor:** ${author}`,
    `**Repositorio:** ${repo}`,
    '',
    '---',
    '',
    '## Problemas detectados',
    '',
  ];

  for (const item of items) {
    const sev = SEVERITY_EMOJI[item.severity] ?? '⚪';
    const cat = CATEGORY_LABEL[item.category] ?? item.category;

    lines.push(`### ${sev} [${item.severity.toUpperCase()}] ${cat}`);
    lines.push(`**Archivo:** \`${item.file}\``);
    lines.push(`**Problema:** ${item.description}`);
    lines.push(`**Sugerencia:** ${item.suggestion}`);
    lines.push('');
  }

  lines.push('---');
  lines.push('*Detectado automáticamente por Claude Opus 4.6 en merge a main*');

  return lines.join('\n');
}

function getTrelloCardTitle(analysis) {
  const commitShort = process.env.COMMIT_SHA?.substring(0, 7) ?? '???????';
  const criticalCount = analysis.items.filter((i) => i.severity === 'critical').length;
  const highCount = analysis.items.filter((i) => i.severity === 'high').length;

  const prefix = criticalCount > 0 ? '🔴' : highCount > 0 ? '🟠' : '🟡';
  const total = analysis.items.length;
  const plural = total === 1 ? 'problema' : 'problemas';

  return `${prefix} Deuda Técnica [${commitShort}] — ${total} ${plural} detectado${total === 1 ? '' : 's'}`;
}

async function createTrelloCard(analysis) {
  const { TRELLO_API_KEY, TRELLO_TOKEN, TRELLO_LIST_ID } = process.env;

  const name = getTrelloCardTitle(analysis);
  const desc = formatTrelloDescription(analysis);

  // Asignar label de color según severidad más alta
  const hasCritical = analysis.items.some((i) => i.severity === 'critical');
  const hasHigh = analysis.items.some((i) => i.severity === 'high');
  const color = hasCritical ? 'red' : hasHigh ? 'orange' : 'yellow';

  const url = new URL('https://api.trello.com/1/cards');
  url.searchParams.set('key', TRELLO_API_KEY);
  url.searchParams.set('token', TRELLO_TOKEN);
  url.searchParams.set('idList', TRELLO_LIST_ID);
  url.searchParams.set('name', name);
  url.searchParams.set('desc', desc);
  url.searchParams.set('pos', 'top');

  const response = await fetch(url.toString(), { method: 'POST' });

  if (!response.ok) {
    const error = await response.text();
    console.error('Error creando card en Trello:', error);
    process.exit(1);
  }

  const card = await response.json();
  console.log(`✅ Ticket creado en Trello: ${card.shortUrl}`);
  return card;
}

async function main() {
  const diff = getDiff();

  if (!diff) {
    console.log('No hay cambios detectados. Nada que analizar.');
    return;
  }

  const analysis = await analyzeWithClaude(diff);

  console.log(`\nDeuda técnica detectada: ${analysis.has_debt}`);
  console.log(`Problemas encontrados: ${analysis.items.length}`);
  analysis.items.forEach((item) => {
    console.log(`  ${item.severity.toUpperCase()} [${item.category}] ${item.file}: ${item.description}`);
  });

  if (!analysis.has_debt || analysis.items.length === 0) {
    console.log('\n✅ Sin deuda técnica. No se crea ticket en Trello.');
    return;
  }

  await createTrelloCard(analysis);
}

main().catch((err) => {
  console.error('Error inesperado:', err);
  process.exit(1);
});
