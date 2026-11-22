# Peer-Benchmark Vergleichsportale

Privates Bewerbungsprojekt ohne Verbindung zu CHECK24. Nur öffentliche Daten; Kursdaten aus S&P Capital IQ (Rohkurse nicht im Repo, veröffentlicht werden nur die daraus gerechneten Betas).

Dashboard mit drei Teilen:

1. **Peer-Gruppe**: 14 vorab geprüfte Vergleichsportale und Vermittler mit Eignungs-Score (1 bis 5), Schaltern je Reiter und Live-Prüfung neuer Kandidaten.
2. **Reiter 1**: Marketingmarge und EBITDA-Marge, GJ 2023 bis 2025 plus letzte zwölf Monate, mit Definition je Unternehmen.
3. **Reiter 2**: Eigenkapitalkosten nach CAPM mit selbst gerechneten Peer-Betas, Basiszins nach IDW S 1 und Marktrisikoprämie nach FAUB.

Datenstand: Kurse 20.11.2026, Abschlüsse 22.11.2026.

## Aufbau

- `data/`: geprüfte Datendateien (Stammdaten, Finanzzahlen, Definitionen, Scores, Betas, Parameter). Jede Zahl hat Quelle, Stichtag und Label.
- `scripts/validate-data.mjs`: Prüfskript, läuft vor jedem Build und bricht bei fehlenden Quellen ab.
- `scripts/compute-betas.mjs`: rechnet die Betas lokal aus privaten Kursdateien.
- `src/app/`: Seiten und Server-Funktionen (Live-Prüfung, Score).

## Lokal starten

```bash
npm install
npm run dev
```

Optionale Einstellungen (nur in Vercel, nie im Repo): `SEC_CONTACT_EMAIL`, `COMPANIES_HOUSE_API_KEY`, `ANTHROPIC_API_KEY`.
