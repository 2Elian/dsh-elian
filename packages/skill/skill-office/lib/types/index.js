/** Bundled Office workflows and filesystem resources for document authoring and checks. */
import { readFileSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import z from '@deepseek-ai/schemastery';
import { BUNDLED_SKILL_RANK } from '@deepseek-ai/dsh-skill';
import { parse as parseYaml } from 'yaml';
const SKILL_NAMES = ['office-docx', 'office-pptx', 'office-xlsx'];
/** Validated resource configuration. */
export const Config = z.object({ assetRoot: z.string().min(1) });
/** Cordis plugin identity. */
export const name = 'skill-office';
/** Registry used by the bundled provider. */
export const inject = ['skills'];
function parseSkill(raw, path) {
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw);
    if (frontmatter?.[1] === undefined)
        throw new Error(`skill-office: ${path} has no YAML frontmatter`);
    const metadata = parseYaml(frontmatter[1]);
    const description = typeof metadata === 'object' && metadata !== null && 'description' in metadata
        ? metadata.description : undefined;
    if (typeof description !== 'string' || description.length === 0)
        throw new Error(`skill-office: ${path} has no description`);
    return { description, content: raw.slice(frontmatter[0].length).trim() };
}
/**
 * Register Office skills with resources readable by the script interpreter.
 * @param ctx - Context carrying the skill registry.
 * @param config - Optional external assets directory for packaged applications.
 */
export function apply(ctx, config = {}) {
    const assetRoot = config.assetRoot ?? fileURLToPath(new URL('../assets/', import.meta.url));
    if (!isAbsolute(assetRoot))
        throw new Error('skill-office: assetRoot must be an absolute directory');
    if (!statSync(join(assetRoot, 'scripts', 'check_office.py')).isFile()) {
        throw new Error('skill-office: assets must contain scripts/check_office.py');
    }
    const candidates = SKILL_NAMES.map((skillName) => {
        const directory = join(assetRoot, skillName);
        const path = join(directory, 'SKILL.md');
        const { description } = parseSkill(readFileSync(path, 'utf8'), path);
        return {
            name: skillName, description,
            invocation: { modelInvocable: true, userInvocable: true },
            provider: 'dsh-office', source: 'bundled', rank: BUNDLED_SKILL_RANK,
            resourceBase: { kind: 'directory', path: directory }, locator: path,
        };
    });
    const provider = {
        name: 'dsh-office',
        list: () => Promise.resolve(candidates),
        async get(candidate, options) {
            const { rank: _rank, locator, ...summary } = candidate;
            const raw = await readFile(locator, { encoding: 'utf8', signal: options.signal });
            return { ...summary, content: parseSkill(raw, locator).content };
        },
    };
    ctx.skills.registerProvider(() => provider);
}
//# sourceMappingURL=index.js.map