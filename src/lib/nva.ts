/**
 * NVA and Cristin API helpers — build-time only.
 * All functions create a fresh AbortSignal per call (signals cannot be reused).
 */

// ── Internal fetch option factories ───────────────────────────────────────────

function makeFetchOpts(): RequestInit {
  return {
    headers: {
      Accept: "application/json",
      "User-Agent": "hotspots-website/1.0 (anders.finstad@ntnu.no)",
    },
    signal: AbortSignal.timeout(4000),
  };
}

function makeCristinOpts(): RequestInit {
  return {
    headers: { "User-Agent": "hotspots-website/1.0 (anders.finstad@ntnu.no)" },
    signal: AbortSignal.timeout(4000),
  };
}

// ── URL helpers ────────────────────────────────────────────────────────────────

/** Full NVA Cristin project URI from a project ID. */
export function nvaProjectUri(cristinProjectId: string): string {
  return `https://api.nva.unit.no/cristin/project/${cristinProjectId}`;
}

/** Pick the best label for a display language, falling back nb → en. */
export function pickLabel(
  labels: Record<string, string> | undefined,
  lang: string
): string {
  if (!labels) return "";
  if (lang === "en") return labels["en"] ?? labels["nb"] ?? "";
  return labels["nb"] ?? labels["nn"] ?? labels["en"] ?? "";
}

/** Extract a Cristin person ID from a full person URI. */
export function cristinIdFromUri(uri: string): string {
  return uri.split("/").pop() ?? "";
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Publication {
  title: string;
  authors: string;
  year: string;
  source: string;
  url: string;
}

export interface CorePerson {
  cristinId: string;
  name: string;
  /** Raw NVA role type, e.g. "ProjectManager" | "ProjectParticipant" */
  roleType: string;
  /** Department / institute level, bilingual */
  institution: { nb: string; en: string };
  /** Top-level parent institution (e.g. NTNU, NINA), bilingual */
  topInstitution: { nb: string; en: string };
  orcid?: string;
}

export interface PubContributor {
  cristinId: string;
  name: string;
  /** Department / institute level, bilingual */
  institution: { nb: string; en: string };
  /** Top-level parent institution, bilingual */
  topInstitution: { nb: string; en: string };
}

export interface ProjectMeta {
  /** popularScientificSummary keyed by language code (nb, en, …) */
  description: Record<string, string>;
  funders: { name: string; ref: string }[];
}

// ── API functions ──────────────────────────────────────────────────────────────

/** Fetch an ORCID identifier from the Cristin person API. Returns undefined on error. */
export async function fetchOrcid(cristinId: string): Promise<string | undefined> {
  try {
    const res = await fetch(
      `https://api.cristin.no/v2/persons/${cristinId}?format=json`,
      makeCristinOpts()
    );
    if (!res.ok) return undefined;
    const data = await res.json();
    return data.orcid?.id ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Fetch publications for a Cristin project, sorted newest first.
 * Returns an empty array on any error (logs a warning).
 */
export async function fetchPublications(
  cristinProjectId: string,
  opts: { size?: number; sort?: string } = {}
): Promise<Publication[]> {
  const { size = 50, sort = "publicationDate:desc" } = opts;
  const projectUri = nvaProjectUri(cristinProjectId);
  const url = `https://api.nva.unit.no/search/resources?project=${encodeURIComponent(projectUri)}&size=${size}&sort=${sort}`;

  try {
    const res = await fetch(url, makeFetchOpts());
    if (!res.ok) {
      console.warn(`[nva] Publications fetch returned ${res.status}`);
      return [];
    }
    const data = await res.json();
    return (data.hits ?? []).map((hit: any) => {
      const desc = hit.entityDescription ?? {};
      const ctx = desc.reference?.publicationContext ?? {};
      const seriesName = ctx.name ?? ctx.title ?? "";
      const seriesNum = ctx.seriesNumber ?? "";

      // Handle URLs are stored in additionalIdentifiers, not hit.handle
      const handleUrl = (hit.additionalIdentifiers ?? [])
        .find((id: any) => id.type === "HandleIdentifier")?.value as string | undefined;

      return {
        title: desc.mainTitle ?? hit.mainTitle ?? "Untitled",
        authors: (desc.contributors ?? hit.contributors ?? [])
          .map((c: any) => c.identity?.name ?? "")
          .filter(Boolean)
          .join(", "),
        year: desc.publicationDate?.year ?? hit.publicationDate?.year ?? "",
        source: seriesName
          ? `${seriesName}${seriesNum ? ` (${seriesNum})` : ""}`
          : "",
        url: hit.handle ?? handleUrl ?? "",
      } satisfies Publication;
    });
  } catch (e) {
    console.warn("[nva] Publications fetch failed:", e);
    return [];
  }
}

/**
 * Fetch project metadata: popular-science description and funders.
 * Returns null on error.
 */
export async function fetchProjectMeta(
  cristinProjectId: string
): Promise<ProjectMeta | null> {
  try {
    const res = await fetch(nvaProjectUri(cristinProjectId), makeFetchOpts());
    if (!res.ok) {
      console.warn(`[nva] Project meta fetch returned ${res.status}`);
      return null;
    }
    const data = await res.json();
    return {
      description: data.popularScientificSummary ?? {},
      funders: (data.funding ?? [])
        .map((f: any) => ({
          name: f.labels?.["nb"] ?? f.labels?.["en"] ?? "",
          ref: f.identifier ?? "",
        }))
        .filter((f: any) => f.name),
    };
  } catch (e) {
    console.warn("[nva] Project meta fetch failed:", e);
    return null;
  }
}

/**
 * Fetch the core project team from the NVA project API.
 * Looks up each person's ORCID via the Cristin API in parallel.
 * Also resolves each person's top-level institution (e.g. NTNU, NINA)
 * from the NVA organisation API using the affiliation ID.
 * Returns an empty array on error.
 */
export async function fetchCoreTeam(
  cristinProjectId: string
): Promise<CorePerson[]> {
  try {
    const res = await fetch(nvaProjectUri(cristinProjectId), makeFetchOpts());
    if (!res.ok) {
      console.warn(`[nva] Core team fetch returned ${res.status}`);
      return [];
    }
    const data = await res.json();
    const contributors: any[] = data.contributors ?? [];

    // Collect unique top-level org codes (e.g. "194.0.0.0" for NTNU)
    const topCodes = new Set<string>();
    for (const c of contributors) {
      const affiliationId: string = c.roles?.[0]?.affiliation?.id ?? "";
      const orgCode = affiliationId.split("/").pop() ?? "";
      const topSegment = orgCode.split(".")[0];
      if (topSegment) topCodes.add(`${topSegment}.0.0.0`);
    }

    // Fetch all unique top-level org labels in parallel
    const topOrgLabels = new Map<string, { nb: string; en: string }>();
    await Promise.all(
      Array.from(topCodes).map(async (code) => {
        try {
          const r = await fetch(
            `https://api.nva.unit.no/cristin/organization/${code}`,
            makeFetchOpts()
          );
          if (!r.ok) return;
          const org = await r.json();
          topOrgLabels.set(code, {
            nb: org.labels?.nb ?? org.labels?.en ?? code,
            en: org.labels?.en ?? org.labels?.nb ?? code,
          });
        } catch {
          // leave entry missing — topInstitution will be empty string
        }
      })
    );

    return Promise.all(
      contributors.map(async (c: any) => {
        const cristinId = cristinIdFromUri(c.identity?.id ?? "");
        const orcid = cristinId ? await fetchOrcid(cristinId) : undefined;

        const affiliationId: string = c.roles?.[0]?.affiliation?.id ?? "";
        const orgCode = affiliationId.split("/").pop() ?? "";
        const topSegment = orgCode.split(".")[0];
        const topCode = topSegment ? `${topSegment}.0.0.0` : "";
        const topOrg = topCode ? topOrgLabels.get(topCode) : undefined;

        return {
          cristinId,
          name: `${c.identity?.firstName ?? ""} ${c.identity?.lastName ?? ""}`.trim(),
          roleType: c.roles?.[0]?.type ?? "ProjectParticipant",
          institution: {
            nb: c.roles?.[0]?.affiliation?.labels?.nb ?? c.roles?.[0]?.affiliation?.labels?.en ?? "",
            en: c.roles?.[0]?.affiliation?.labels?.en ?? c.roles?.[0]?.affiliation?.labels?.nb ?? "",
          },
          topInstitution: {
            nb: topOrg?.nb ?? "",
            en: topOrg?.en ?? "",
          },
          orcid,
        } satisfies CorePerson;
      })
    );
  } catch (e) {
    console.warn("[nva] Core team fetch failed:", e);
    return [];
  }
}

/**
 * Fetch unique contributors from publications, excluding IDs in `excludeIds`.
 * Resolves the top-level parent institution for each contributor in parallel.
 * Useful for finding co-authors beyond the registered project team.
 * Returns an empty array on error.
 */
export async function fetchPublicationContributors(
  cristinProjectId: string,
  excludeIds: Set<string> = new Set()
): Promise<PubContributor[]> {
  const projectUri = nvaProjectUri(cristinProjectId);
  const url = `https://api.nva.unit.no/search/resources?project=${encodeURIComponent(projectUri)}&size=50`;

  try {
    const res = await fetch(url, makeFetchOpts());
    if (!res.ok) {
      console.warn(`[nva] Publication contributors fetch returned ${res.status}`);
      return [];
    }
    const data = await res.json();
    const seen = new Set<string>();

    // First pass: collect raw contributor data
    type RawContrib = {
      cristinId: string;
      name: string;
      institution: { nb: string; en: string };
      topCode: string;
    };
    const raw: RawContrib[] = [];

    for (const hit of data.hits ?? []) {
      for (const c of hit.entityDescription?.contributors ?? []) {
        const cristinId = cristinIdFromUri(c.identity?.id ?? "");
        if (!cristinId || seen.has(cristinId) || excludeIds.has(cristinId)) continue;
        seen.add(cristinId);

        const affiliationId: string = c.affiliations?.[0]?.id ?? "";
        const orgCode = affiliationId.split("/").pop() ?? "";
        const topSegment = orgCode.split(".")[0];
        const topCode = topSegment ? `${topSegment}.0.0.0` : "";

        raw.push({
          cristinId,
          name: c.identity?.name ?? "",
          institution: {
            nb: c.affiliations?.[0]?.labels?.nb ?? c.affiliations?.[0]?.labels?.en ?? "",
            en: c.affiliations?.[0]?.labels?.en ?? c.affiliations?.[0]?.labels?.nb ?? "",
          },
          topCode,
        });
      }
    }

    // Fetch unique top-level org labels in parallel
    const topCodes = new Set(raw.map(r => r.topCode).filter(Boolean));
    const topOrgLabels = new Map<string, { nb: string; en: string }>();
    await Promise.all(
      Array.from(topCodes).map(async (code) => {
        try {
          const r = await fetch(
            `https://api.nva.unit.no/cristin/organization/${code}`,
            makeFetchOpts()
          );
          if (!r.ok) return;
          const org = await r.json();
          topOrgLabels.set(code, {
            nb: org.labels?.nb ?? org.labels?.en ?? code,
            en: org.labels?.en ?? org.labels?.nb ?? code,
          });
        } catch {
          // leave entry missing — topInstitution will be empty string
        }
      })
    );

    return raw.map(({ cristinId, name, institution, topCode }) => {
      const topOrg = topCode ? topOrgLabels.get(topCode) : undefined;
      return {
        cristinId,
        name,
        institution,
        topInstitution: {
          nb: topOrg?.nb ?? "",
          en: topOrg?.en ?? "",
        },
      };
    });
  } catch (e) {
    console.warn("[nva] Publication contributors fetch failed:", e);
    return [];
  }
}
