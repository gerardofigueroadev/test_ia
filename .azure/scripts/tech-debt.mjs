import { execSync } from "child_process";
import Anthropic from "@anthropic-ai/sdk";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY no está definido");
  process.exit(1);
}

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `Eres un experto en seguridad y calidad de software.

Analiza el diff de código y detecta deuda técnica según:

1. Credenciales hardcodeadas
2. Hashing inseguro (MD5, SHA1)
3. Bugs
4. Violaciones de buenas prácticas
5. OWASP Top 10
6. Problemas de mantenibilidad
7. Inconsistencias de estándares

Responde SOLO con JSON válido con esta estructura:

{
  "has_debt": boolean,
  "summary": string,
  "items": [
    {
      "category": "security|bug|maintainability|performance|standards",
      "severity": "critical|high|medium|low",
      "description": string,
      "file": string,
      "suggestion": string
    }
  ]
}`;

function getDiff() {
  try {
    const base = process.env.BASE_SHA;
    const head = process.env.HEAD_SHA;

    let diff;

    if (base && head) {
      diff = execSync(`git diff ${base} ${head}`, { encoding: "utf-8" });
    } else {
      diff = execSync("git diff HEAD~1 HEAD", { encoding: "utf-8" });
    }

    if (!diff.trim()) return null;

    const MAX = 80_000;

    return diff.length > MAX
      ? diff.substring(0, MAX) + "\n\n[... diff truncado ...]"
      : diff;
  } catch (err) {
    console.error("Error obteniendo diff:", err.message);
    process.exit(1);
  }
}

async function analyzeWithClaude(diff) {
  console.log("Analizando código con Claude...");

  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Analiza este diff y devuelve el JSON:\n\n${diff}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");

  if (!textBlock) {
    throw new Error("Claude no devolvió texto.");
  }

  const raw = textBlock.text
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error("Claude devolvió JSON inválido:");
    console.error(raw);
    throw err;
  }
}

const SEVERITY_TO_PRIORITY = {
  critical: 1,
  high: 2,
  medium: 3,
  low: 4,
};

function getWorkItemTitle(analysis) {
  const commitShort = process.env.COMMIT_SHA?.substring(0, 7) ?? "???????";

  const critical = analysis.items.filter((i) => i.severity === "critical").length;
  const high = analysis.items.filter((i) => i.severity === "high").length;

  const prefix = critical ? "🔴" : high ? "🟠" : "🟡";

  return `${prefix} Deuda Técnica [${commitShort}] — ${analysis.items.length} problemas`;
}

function buildWorkItemDescription(analysis) {
  const commitShort = process.env.COMMIT_SHA?.substring(0, 7) ?? "unknown";
  const author = process.env.COMMIT_AUTHOR ?? "unknown";
  const repo = process.env.REPO ?? "";
  const commitMsg = process.env.COMMIT_MESSAGE ?? "";

  const rows = analysis.items
    .map(
      (item) => `
<tr>
<td>${item.severity.toUpperCase()}</td>
<td>${item.category}</td>
<td><code>${item.file}</code></td>
<td>${item.description}</td>
<td>${item.suggestion}</td>
</tr>`
    )
    .join("");

  return `
<h3>Resumen</h3>
<p>${analysis.summary}</p>

<h3>Commit</h3>
<ul>
<li><b>Commit:</b> ${commitShort}</li>
<li><b>Autor:</b> ${author}</li>
<li><b>Repo:</b> ${repo}</li>
<li><b>Mensaje:</b> ${commitMsg}</li>
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
<em>Detectado automáticamente por Claude</em>
`;
}

async function createAzureWorkItem(analysis) {
  const { AZURE_DEVOPS_TOKEN, ORGANIZATION, PROJECT } = process.env;

  if (!AZURE_DEVOPS_TOKEN) {
    console.error("AZURE_DEVOPS_TOKEN no está definido");
    process.exit(1);
  }

  const orgUrl = ORGANIZATION.replace(/\/$/, "");

  const title = getWorkItemTitle(analysis);
  const description = buildWorkItemDescription(analysis);

  const topSeverity = ["critical", "high", "medium", "low"].find((s) =>
    analysis.items.some((i) => i.severity === s)
  );

  const priority = SEVERITY_TO_PRIORITY[topSeverity] ?? 3;

  const patchDocument = [
    { op: "add", path: "/fields/System.Title", value: title },
    { op: "add", path: "/fields/System.Description", value: description },
    { op: "add", path: "/fields/Microsoft.VSTS.Common.Priority", value: priority },
    { op: "add", path: "/fields/System.Tags", value: "tech-debt;claude-ai" },
  ];

  const url = `${orgUrl}/${encodeURIComponent(
    PROJECT
  )}/_apis/wit/workitems/$Task?api-version=7.1`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${AZURE_DEVOPS_TOKEN}`,
      "Content-Type": "application/json-patch+json",
    },
    body: JSON.stringify(patchDocument),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("Error creando Work Item:", error);
    process.exit(1);
  }

  const item = await response.json();

  console.log(
    `✅ Work Item creado: ${item._links?.html?.href ?? item.id}`
  );
}

async function main() {
  const diff = getDiff();

  if (!diff) {
    console.log("No hay cambios para analizar.");
    return;
  }

  const analysis = await analyzeWithClaude(diff);

  console.log(`Deuda técnica: ${analysis.has_debt}`);
  console.log(`Items: ${analysis.items.length}`);

  if (!analysis.has_debt || analysis.items.length === 0) {
    console.log("Sin deuda técnica.");
    return;
  }

  await createAzureWorkItem(analysis);
}

main().catch((err) => {
  console.error("Error inesperado:", err);
  process.exit(1);
});