/** Lettering stays in JSX so titles remain editable and safely escaped. */
export default function FilmTitle({ film }) {
  const titles = {
    fleuve: <>Là où le fleuve<br /><em>nous mène.</em></>,
    yaounde: <>Les jours de<br /><strong>Yaoundé</strong></>,
    taxi: <>LE DERNIER<br /> <strong>TAXI</strong></>,
    racines: <>Nos voix,<br /><em>nos racines</em></>,
    foumban: <>Une saison<br /><em>à Foumban</em></>,
    rives: <>ENTRE<br />DEUX RIVES</>,
    retour: <>Le goût<br /><em>du retour</em></>,
    collines: <>La promesse<br />des collines</>,
  };

  return titles[film.id] ?? film.title;
}
