import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import DIE from "@snomiao/die";

/**
 * Template slot values interface
 */
export interface TemplateSlots {
  [key: string]: string;
}

/**
 * Load and replace template slots in a string
 * @param template - Template string with ${SLOT_NAME} placeholders
 * @param slots - Object mapping slot names to values
 * @returns Processed template string
 * @throws Error if unknown slots are unreplaced
 */
export function replaceTemplateSlots(template: string, slots: TemplateSlots): string {
  let result = template;

  // Replace all slots
  for (const [key, value] of Object.entries(slots)) {
    const placeholder = `\${${key}}`;
    result = result.replaceAll(placeholder, value);
  }

  // Check for unreplaced slots
  const unreplacedSlots = result.match(/\$\{[A-Z_][A-Z0-9_]*\}/g);
  if (unreplacedSlots && unreplacedSlots.length > 0) {
    DIE(
      `Template contains unreplaced slots: ${unreplacedSlots.join(", ")}\n` +
        `Available slots: ${Object.keys(slots).join(", ")}\n` +
        `Template preview: ${result.slice(0, 200)}...`,
    );
  }

  return result;
}

/**
 * Load CLAUDE.md template from .bot/CLAUDE.md
 * @param slots - Template slot values
 * @returns Processed CLAUDE.md content
 */
export function loadClaudeMd(slots: TemplateSlots): string {
  const templatePath = join(import.meta.dir, "../.bot/CLAUDE.md");
  const template = readFileSync(templatePath, "utf-8");
  return replaceTemplateSlots(template, slots);
}

/**
 * Load all skill templates from .bot/skills/
 * @param slots - Template slot values
 * @returns Object mapping skill names to processed skill content
 */
export function loadSkills(slots: TemplateSlots): Record<string, string> {
  const skillsDir = join(import.meta.dir, "../.bot/skills");
  const skillDirs = readdirSync(skillsDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

  const skills: Record<string, string> = {};

  for (const skillName of skillDirs) {
    const skillPath = join(skillsDir, skillName, "SKILL.md");
    try {
      const template = readFileSync(skillPath, "utf-8");
      skills[skillName] = replaceTemplateSlots(template, slots);
    } catch (error: unknown) {
      DIE(`Failed to load skill '${skillName}' from ${skillPath}: ${error.message}`);
    }
  }

  return skills;
}

/**
 * Load a specific skill template
 * @param skillName - Name of the skill (directory name in .bot/skills/)
 * @param slots - Template slot values
 * @returns Processed skill content
 */
export function loadSkill(skillName: string, slots: TemplateSlots): string {
  const skillPath = join(import.meta.dir, "../.bot/skills", skillName, "SKILL.md");
  try {
    const template = readFileSync(skillPath, "utf-8");
    return replaceTemplateSlots(template, slots);
  } catch (error: unknown) {
    DIE(`Failed to load skill '${skillName}' from ${skillPath}: ${error.message}`);
  }
}
