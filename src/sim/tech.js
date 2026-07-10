/* Technology tree. Discovery is gradual and the path differs between games:
   each civilization gets randomized affinities so research order varies. */
(function () {
  'use strict';
  const PCS = (globalThis.PCS = globalThis.PCS || {});

  // cost = research points; era used for professions/visuals
  const TECHS = [
    { id: 'fuoco', name: 'Fuoco controllato', era: 'ancient', cost: 8, req: [] },
    { id: 'linguaggio', name: 'Linguaggio complesso', era: 'ancient', cost: 10, req: [] },
    { id: 'caccia', name: 'Tecniche di caccia', era: 'ancient', cost: 10, req: ['fuoco'] },
    { id: 'agricoltura', name: 'Agricoltura', era: 'ancient', cost: 22, req: ['fuoco'] },
    { id: 'ceramica', name: 'Ceramica', era: 'ancient', cost: 15, req: ['fuoco'] },
    { id: 'tessitura', name: 'Tessitura', era: 'ancient', cost: 15, req: [] },
    { id: 'ruota', name: 'Ruota', era: 'ancient', cost: 25, req: ['agricoltura'] },
    { id: 'scrittura', name: 'Scrittura', era: 'classical', cost: 40, req: ['linguaggio', 'agricoltura'] },
    { id: 'bronzo', name: 'Lavorazione del bronzo', era: 'classical', cost: 35, req: ['ceramica'] },
    { id: 'vela', name: 'Vela', era: 'classical', cost: 30, req: ['tessitura'] },
    { id: 'matematica', name: 'Matematica', era: 'classical', cost: 45, req: ['scrittura'] },
    { id: 'moneta', name: 'Moneta coniata', era: 'classical', cost: 40, req: ['bronzo', 'scrittura'] },
    { id: 'ferro', name: 'Lavorazione del ferro', era: 'classical', cost: 55, req: ['bronzo'] },
    { id: 'ingegneria', name: 'Ingegneria', era: 'classical', cost: 60, req: ['matematica', 'ruota'] },
    { id: 'medicina', name: 'Medicina', era: 'medieval', cost: 65, req: ['scrittura'] },
    { id: 'navigazione', name: 'Navigazione astronomica', era: 'medieval', cost: 70, req: ['vela', 'matematica'] },
    { id: 'acciaio', name: 'Acciaio', era: 'medieval', cost: 80, req: ['ferro'] },
    { id: 'universita', name: 'Università', era: 'medieval', cost: 75, req: ['matematica', 'medicina'] },
    { id: 'stampa', name: 'Stampa a caratteri mobili', era: 'early_modern', cost: 95, req: ['universita'] },
    { id: 'polvere', name: 'Polvere da sparo', era: 'early_modern', cost: 100, req: ['acciaio'] },
    { id: 'ottica', name: 'Ottica', era: 'early_modern', cost: 90, req: ['universita'] },
    { id: 'banche', name: 'Sistema bancario', era: 'early_modern', cost: 85, req: ['moneta', 'stampa'] },
    { id: 'metodo', name: 'Metodo scientifico', era: 'early_modern', cost: 110, req: ['stampa', 'ottica'] },
    { id: 'vapore', name: 'Macchina a vapore', era: 'industrial', cost: 140, req: ['metodo', 'acciaio'] },
    { id: 'vaccini', name: 'Vaccini', era: 'industrial', cost: 130, req: ['metodo', 'medicina'] },
    { id: 'ferrovia', name: 'Ferrovia', era: 'industrial', cost: 150, req: ['vapore'] },
    { id: 'elettricita', name: 'Elettricità', era: 'industrial', cost: 170, req: ['metodo'] },
    { id: 'telegrafo', name: 'Telegrafo', era: 'industrial', cost: 150, req: ['elettricita'] },
    { id: 'motore', name: 'Motore a combustione', era: 'modern', cost: 190, req: ['vapore', 'elettricita'] },
    { id: 'volo', name: 'Volo a motore', era: 'modern', cost: 210, req: ['motore'] },
    { id: 'antibiotici', name: 'Antibiotici', era: 'modern', cost: 200, req: ['vaccini'] },
    { id: 'radio', name: 'Radio', era: 'modern', cost: 190, req: ['telegrafo'] },
    { id: 'computer', name: 'Computer', era: 'modern', cost: 260, req: ['elettricita', 'radio'] },
    { id: 'atomo', name: 'Energia atomica', era: 'modern', cost: 280, req: ['computer'] },
    { id: 'spazio', name: 'Volo spaziale', era: 'modern', cost: 320, req: ['computer', 'volo'] },
  ];
  const TECH_BY_ID = {};
  for (const t of TECHS) TECH_BY_ID[t.id] = t;
  const ERAS = ['ancient', 'classical', 'medieval', 'early_modern', 'industrial', 'modern'];
  const ERA_NAMES = {
    ancient: 'Età Antica', classical: 'Età Classica', medieval: 'Età di Mezzo',
    early_modern: 'Età delle Scoperte', industrial: 'Età delle Macchine', modern: 'Età Moderna',
  };

  function civEra(civ) {
    let best = 0;
    for (const id of civ.techs) {
      const e = ERAS.indexOf(TECH_BY_ID[id].era);
      if (e > best) best = e;
    }
    return ERAS[best];
  }
  function availableTechs(civ) {
    return TECHS.filter(t => !civ.techs.includes(t.id) && t.req.every(r => civ.techs.includes(r)));
  }

  PCS.TECHS = TECHS;
  PCS.TECH_BY_ID = TECH_BY_ID;
  PCS.ERAS = ERAS;
  PCS.ERA_NAMES = ERA_NAMES;
  PCS.civEra = civEra;
  PCS.availableTechs = availableTechs;
})();
