import { execSync } from 'child_process';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const DEBT_SCHEMA = {
  type: 'object',
  properties: {
    has_debt: { type: 'boolean' },
    summary: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: [
              'security',
              'bug',
              'maintainability',
              'performance',
              'standards',
            ],
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
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  const raw = textBlock.text.replace(/```json|```/g, '').trim();
  return JSON.parse(raw);
}

// ---------------------------------------------------------
// Mapeo de severidad a prioridad de Azure DevOps Work Item
// Priority: 1=Critical, 2=High, 3=Medium, 4=Low
// ---------------------------------------------------------
const SEVERITY_TO_PRIORITY = {
  critical: 1,
  high: 2,
  medium: 3,
  low: 4,
};

// Etiquetas legibles para la descripción
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

function buildWorkItemDescription(analysis) {
  const { summary, items } = analysis;

  const commitShort = process.env.COMMIT_SHA?.substring(0, 7) ?? 'unknown';
  const author = process.env.COMMIT_AUTHOR ?? 'unknown';
  const repo = process.env.REPO ?? '';
  const commitMsg = process.env.COMMIT_MESSAGE ?? '';

  // Azure DevOps acepta HTML en el campo description de Work Items
  const rows = items
    .map((item) => {
      const sev = SEVERITY_EMOJI[item.severity] ?? '⚪';
      const cat = CATEGORY_LABEL[item.category] ?? item.category;
      return `
        <tr>
          <td>${sev} ${item.severity.toUpperCase()}</td>
          <td>${cat}</td>
          <td><code>${item.file}</code></td>
          <td>${item.description}</td>
          <td>${item.suggestion}</td>
        </tr>`;
    })
    .join('');

  return `
<h3>Resumen</h3>
<p>${summary}</p>

<h3>Información del commit</h3>
<ul>
  <li><strong>Commit:</strong> <code>${commitShort}</code> — ${commitMsg}</li>
  <li><strong>Autor:</strong> ${author}</li>
  <li><strong>Repositorio:</strong> ${repo}</li>
</ul>

<h3>Problemas detectados</h3>
<table>
  <thead>
    <tr>
      <th>Severidad</th>
      <th>Categoría</th>
      <th>Archivo</th>
      <th>Problema</th>
      <th>Sugerencia</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
  </tbody>
</table>

<hr/>
<em>Detectado automáticamente por Claude Opus 4.6 en merge a main</em>
`.trim();
}

function getWorkItemTitle(analysis) {
  const commitShort = process.env.COMMIT_SHA?.substring(0, 7) ?? '???????';
  const criticalCount = analysis.items.filter(
    (i) => i.severity === 'critical',
  ).length;
  const highCount = analysis.items.filter((i) => i.severity === 'high').length;

  const prefix =
    criticalCount > 0 ? '🔴' : highCount > 0 ? '🟠' : '🟡';
  const total = analysis.items.length;
  const plural = total === 1 ? 'problema' : 'problemas';

  return `${prefix} Deuda Técnica [${commitShort}] — ${total} ${plural} detectado${total === 1 ? '' : 's'}`;
}

// ---------------------------------------------------------
// Crea un Work Item de tipo "Task" en Azure Boards
// Documentación: https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items/create
// ---------------------------------------------------------
async function createAzureWorkItem(analysis) {
  const { AZURE_DEVOPS_TOKEN, ORGANIZATION, PROJECT } = process.env;

  const orgUrl = ORGANIZATION.replace(/\/$/, '');
  const title = getWorkItemTitle(analysis);
  const description = buildWorkItemDescription(analysis);

  // Prioridad basada en el item más severo
  const topSeverity = ['critical', 'high', 'medium', 'low'].find((s) =>
    analysis.items.some((i) => i.severity === s),
  );
  const priority = SEVERITY_TO_PRIORITY[topSeverity] ?? 3;

  // Etiquetas (tags) con las categorías encontradas
  const tags = [
    'tech-debt',
    'claude-ai',
    ...new Set(analysis.items.map((i) => i.category)),
  ].join('; ');

  // El body usa JSON Patch para Work Items de Azure DevOps
  const patchDocument = [
    {
      op: 'add',
      path: '/fields/System.Title',
      value: title,
    },
    {
      op: 'add',
      path: '/fields/System.Description',
      value: description,
    },
    {
      op: 'add',
      path: '/fields/Microsoft.VSTS.Common.Priority',
      value: priority,
    },
    {
      op: 'add',
      path: '/fields/System.Tags',
      value: tags,
    },
    // Opcional: mover a "To Do" si el board lo tiene configurado
    {
      op: 'add',
      path: '/fields/System.State',
      value: 'To Do',
    },
  ];

  // POST /wit/workitems/$Task  (el tipo puede cambiarse a "Issue", "Bug", etc.)
  const url = `${orgUrl}/${encodeURIComponent(PROJECT)}/_apis/wit/workitems/$Task?api-version=7.1`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${AZURE_DEVOPS_TOKEN}`,
      'Content-Type': 'application/json-patch+json',
    },
    body: JSON.stringify(patchDocument),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Error creando Work Item en Azure Boards:', error);
    process.exit(1);
  }

  const item = await response.json();
  const itemUrl = item._links?.html?.href ?? `${orgUrl}/${PROJECT}/_workitems/edit/${item.id}`;
  console.log(`✅ Work Item creado en Azure Boards: ${itemUrl}`);
  return item;
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
    console.log(
      `  ${item.severity.toUpperCase()} [${item.category}] ${item.file}: ${item.description}`,
    );
  });

  if (!analysis.has_debt || analysis.items.length === 0) {
    console.log('\n✅ Sin deuda técnica. No se crea Work Item.');
    return;
  }

  await createAzureWorkItem(analysis);
}

main().catch((err) => {
  console.error('Error inesperado:', err);
  process.exit(1);
});
