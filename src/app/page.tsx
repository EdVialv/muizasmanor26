const plannedFeatures = [
  "Muižu katalogs",
  "Meklēšana un filtri",
  "Interaktīva karte",
  "Muižu profili",
  "Pasākumu pieprasījumi",
];

export default function Home() {
  return (
    <main>
      <section className="hero" aria-labelledby="page-title">
        <p className="eyebrow">Latvijas kultūrvēsturiskais mantojums</p>
        <h1 id="page-title">Atklāj Latvijas muižas vienuviet</h1>
        <p className="intro">
          Top katalogs ceļotājiem un pasākumu rīkotājiem. Pirmajā versijā varēs atrast muižas,
          salīdzināt iespējas un nosūtīt pasākuma pieprasījumu.
        </p>
        <a className="primaryAction" href="#mvp">
          Apskatīt MVP plānu
        </a>
      </section>

      <section className="featureSection" id="mvp" aria-labelledby="mvp-title">
        <p className="eyebrow">Pirmā versija</p>
        <h2 id="mvp-title">Skaidrs un pārbaudāms sākums</h2>
        <ul className="featureGrid">
          {plannedFeatures.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
