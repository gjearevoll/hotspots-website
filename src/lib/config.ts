/**
 * Loads src/config/project.yaml at build time.
 * Import this module only from Astro frontmatter or server-side code.
 */
import { readFileSync } from "fs";
import { join } from "path";
import yaml from "js-yaml";

export interface FocusBoxUse {
  icon: string;
  title: { no: string; en: string };
  description: { no: string; en: string };
}

export interface ProjectConfig {
  project: {
    name: { no: string; en: string };
    tagline: { no: string; en: string };
    institution: { no: string; en: string };
    github_org: string;
    contact_email: string;
    institution_url: string;
    colors: { primary: string; dark: string };
  };
  nva: {
    cristin_project_id: string;
  };
  focus_box?: {
    heading: { no: string; en: string };
    uses: FocusBoxUse[];
    caveats: {
      heading: { no: string; en: string };
      items: { no: string; en: string }[];
    };
  };
}

const raw = readFileSync(
  join(process.cwd(), "src/config/project.yaml"),
  "utf-8"
);

export const config = yaml.load(raw) as ProjectConfig;
