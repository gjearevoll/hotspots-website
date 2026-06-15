# Hotspots website — utviklarnotes

## Språk og omsetjing
Norsk (nynorsk) er hovudspråk. Engelsk er omsetjing.
Ved alle innhaldsendingar: oppdater norsk først, omset
deretter tilsvarande til engelsk. Hald terminologi konsistent
på tvers av språk. Nye sider må opprettast i både `/no/` og `/en/`.

## Sidestruktur
```
src/pages/
  index.astro          ← redirect til /no/
  no/                  ← norske sider (nynorsk)
  en/                  ← engelske sider
src/layouts/Layout.astro   ← tek lang="no"|"en" prop
src/components/
  LanguageSwitcher.astro
  HeroCarousel.astro
src/lib/nva.ts         ← delte NVA API-konstantar og hjelpefunksjonar
src/data/
  hero-images.yaml
  funders.json         ← ikkje i bruk lenger (hentast frå NVA)
```

## NVA API
- Prosjekt-ID: 2769822
- Prosjekt-URI: https://api.nva.unit.no/cristin/project/2769822
- Alle API-kall brukar `FETCH_OPTS` frå `src/lib/nva.ts` (4 s timeout)
- Publikasjonar, prosjektbeskriving og finansiering hentast automatisk ved bygg

## Automatisk oppdatering
GitHub Actions køyrer ein rebuild kvar natt kl. 03:00 UTC.
NVA-publikasjonar vert henta ved kvar build — ingen manuell
oppdatering nødvendig for publikasjonslista.

All NVA-henting skjer i Astro-frontmatter (`---`-blokka), altså
ved byggetid, ikkje i nettlesaren. Resultatet er statisk HTML.

## Git
- Ingen Co-Authored-By-trailer i commits
