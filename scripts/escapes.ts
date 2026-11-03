import { readFileSync } from 'node:fs';
import ts from 'typescript';

export const ALLOW_MARK = 'allow-unsafe:';

export interface Escape {
  file: string;
  line: number;
  kind: string;
}

function kindOf(node: ts.Node): string | undefined {
  if (node.kind === ts.SyntaxKind.AnyKeyword) return 'any';
  if (ts.isNonNullExpression(node)) return 'non-null assertion';
  if (ts.isTypeAssertionExpression(node)) return 'type assertion';
  if (ts.isAsExpression(node)) {
    const t = node.type;
    const isConst = ts.isTypeReferenceNode(t) && ts.isIdentifier(t.typeName) && t.typeName.text === 'const';
    return isConst ? undefined : 'as cast';
  }
  return undefined;
}

export function findEscapes(file: string, source = readFileSync(file, 'utf8')): Escape[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.ESNext, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lines = source.split('\n');
  const found: Escape[] = [];
  const allowed = (line: number): boolean => (lines[line - 1] ?? '').includes(ALLOW_MARK);
  const visit = (node: ts.Node): void => {
    const kind = kindOf(node);
    if (kind) {
      const start = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      const end = sf.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
      let ok = false;
      for (let l = start; l <= end; l++) ok = ok || allowed(l);
      if (!ok) found.push({ file, line: start, kind });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  const directive = /@ts-(ignore|expect-error|nocheck)/g;
  for (const [i, text] of lines.entries()) if (directive.test(text) && !text.includes(ALLOW_MARK)) found.push({ file, line: i + 1, kind: 'ts directive' });
  return found;
}
