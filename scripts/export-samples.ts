/** Write sample instructions, CSV and BrickLink XML for every starter model into ./out/samples. */
import fs from "node:fs";
import path from "node:path";
import { computeBom } from "../src/lib/bom/bom";
import { bomToBrickLinkXml, bomToCsv } from "../src/lib/bom/export";
import { generateInstructionsPdf } from "../src/lib/instructions/pdf";
import { buildModel, defaultParams, TEMPLATES } from "../src/lib/model/templates";
import { validateModel } from "../src/lib/validation/validate";

const dir = path.resolve("out/samples");
fs.mkdirSync(dir, { recursive: true });
for (const t of TEMPLATES) {
  const model = buildModel(defaultParams(t.id));
  const bom = computeBom(model);
  fs.writeFileSync(path.join(dir, `${t.id}-instructions.pdf`), await generateInstructionsPdf(model, { title: t.name, modeLabel: "SAMPLE", validation: validateModel(model) }));
  fs.writeFileSync(path.join(dir, `${t.id}-parts.csv`), bomToCsv(bom));
  fs.writeFileSync(path.join(dir, `${t.id}-wanted-list.xml`), bomToBrickLinkXml(bom, { allowProvisional: true }));
  console.log(`${t.id}: ${bom.totalPieces} pieces, ${model.steps.length} steps`);
}
console.log(`Wrote samples to ${dir}`);
