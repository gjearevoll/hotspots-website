# Test data – Zenodo mock

Disse filene mimikerer hva vi vil laste ned fra Zenodo i produksjon.

## Struktur
Én fil per avledet produkt, navngitt etter konvensjonen:
  {produkt}_{område}_{oppløsning}_{versjon}.tif

## Filer
- species_richness_norway_demo.tif   – artsrikhet (Int16, antall arter per celle)
- hotspot_index_norway_demo.tif      – hotspot-indeks (Float32, 0–100)
- sampling_effort_norway_demo.tif    – prøvetakingsinnsats (Int16, antall registreringer)

## Geografisk dekning
Norge (WGS84, bbox: 4.0, 57.5, 31.5, 71.5), 220x280 piksler (~100 km oppløsning)

## NB
Dette er syntetiske tilfeldige data kun for å teste STAC-oppsettet.
I produksjon erstattes disse med filer lastet ned fra Zenodo.
