# Hotspots website — utviklarnotes

## Språk og omsetjing
Norsk (nynorsk) er hovudspråk. Engelsk er omsetjing.
Ved alle innhaldsendingar: oppdater norsk først, omset
deretter tilsvarande til engelsk. Hald terminologi konsistent
på tvers av språk. Nye sider må opprettast i både `/no/` og `/en/`.

## Sidestruktur
```
src/
  config/
    project.yaml          ← EINASTE KJELDE FOR PROSJEKTKONFIG
  data/
    hero-images.yaml      ← artsbilete til karusellen
    repositories.yaml     ← GitHub-repositorium (namn, URL, skildring no/en)
    tools.yaml            ← kartprodukt (id, tittel no/en, iframe_src)
  pages/
    index.astro           ← redirect til /no/
    no/                   ← norske sider (nynorsk)
    en/                   ← engelske sider
  layouts/Layout.astro    ← tek lang="no"|"en" prop; hentar konfig frå project.yaml
  components/
    HeroCarousel.astro
    LanguageSwitcher.astro
    PublicationList.astro ← gjenbrukbar publikasjonsliste
    TeamGrid.astro        ← kjerneteam + bidragsytarar
    RepoCard.astro        ← enkelt GitHub-repo-kort
    ToolCard.astro        ← enkelt kart/verktøy-kort (iframe)
  lib/
    config.ts             ← lastar og eksporterar project.yaml
    nva.ts                ← alle NVA/Cristin API-funksjonar
```

## Einaste konfig-fil: src/config/project.yaml
**All prosjektspesifikk konfig lever her.**
Aldri hardkod prosjektnamn, fargar, NVA-ID eller kontaktinfo
i komponentar eller sider. Bruk alltid `config` frå `src/lib/config.ts`.

Felt i project.yaml:
- `project.name`, `project.tagline`, `project.institution` (no/en)
- `project.github_org`, `project.contact_email`, `project.institution_url`
- `project.colors.primary`, `project.colors.dark`
- `nva.cristin_project_id` — Cristin-prosjekt-ID for NVA API-kall

## NVA API — funksjonar i src/lib/nva.ts
Alle NVA- og Cristin-kall skjer via desse typede funksjonane:
- `fetchPublications(cristinProjectId, opts?)` → `Publication[]`
- `fetchProjectMeta(cristinProjectId)` → `ProjectMeta | null`
- `fetchCoreTeam(cristinProjectId)` → `CorePerson[]` (med ORCID)
- `fetchPublicationContributors(cristinProjectId, excludeIds?)` → `PubContributor[]`

Kvar funksjon lagar ein ny `AbortSignal` (4 s timeout) per kall.
Feil returnerer tom liste / null og loggar åtvaring — krasjar aldri bygget.

All NVA-henting skjer i Astro-frontmatter (`---`-blokka), altså
ved byggetid, ikkje i nettlesaren. Resultatet er statisk HTML.

## Automatisk oppdatering
GitHub Actions køyrer ein rebuild kvar natt kl. 03:00 UTC.
NVA-data vert henta ved kvar build — ingen manuell oppdatering nødvendig.

## Focus box (bruksområde)
Focus box-innhald (bruksområde og avgrensningar) ligg i
`src/config/project.yaml` under nøkkelen `focus_box`.
Oppdater alltid begge språkversjonane (`no` og `en`) samtidig.
Ikonnamn er Tabler Icons-klassar (`ti-trees`, `ti-shield-check`, osb.).

## Legge til innhald
- **Publikasjonar**: automatisk frå NVA
- **Teammedlemmar**: edit `src/config/project.yaml` (kjerneteam hentast òg frå NVA)
- **Herobilete**: legg fil i `public/images/species/` + rad i `src/data/hero-images.yaml`
- **Kart**: legg HTML-fil i `public/kart/` + rad i `src/data/tools.yaml`
- **Repositorium**: edit `src/data/repositories.yaml`

## Git
- Remote: https://github.com/gjearevoll/hotspots-website.git
- Live site: https://gjearevoll.github.io/hotspots-website/
- Ingen Co-Authored-By-trailer i commits
