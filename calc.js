/* Calculs de la collection : reprend la logique du fichier Excel d'origine. */
(function (root) {
  const DAY = 86400000;
  const WISH = 'Pas encore acheté';

  function parseISO(s) {
    if (!s) return null;
    const p = String(s).split('-').map(Number);
    if (p.length !== 3 || p.some(isNaN)) return null;
    return new Date(p[0], p[1] - 1, p[2]);
  }
  function iso(d) {
    const z = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
  }
  function fullYears(a, b) {
    let y = b.getFullYear() - a.getFullYear();
    if (new Date(b.getFullYear(), a.getMonth(), a.getDate()) > b) y--;
    return Math.max(0, y);
  }
  function fullMonths(a, b) {
    let m = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
    if (b.getDate() < a.getDate()) m--;
    return Math.max(0, m);
  }
  const num = v => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0; };

  /* Montant d'une ligne « fonds extra » à une date donnée (unique, par an, par mois). */
  function extraAt(f, when) {
    const amt = num(f.extra);
    if (!amt) return 0;
    const a = parseISO(f.debut);
    if (a && a > when) return 0;
    if (f.type === 'annuel' || f.type === 'mensuel') {
      if (!a) return 0;
      let b = f.fin ? parseISO(f.fin) : when;
      if (b > when) b = when;
      return amt * (f.type === 'annuel' ? fullYears(a, b) : fullMonths(a, b));
    }
    return amt;
  }
  function fraisAt(f, when) {
    const a = parseISO(f.debut);
    if (a && a > when) return 0;
    return num(f.frais);
  }

  // Prix du marché d'une référence : moyenne de BrickLink (ou saisie) et de Brickfact quand les deux existent.
  function marketOf(p) {
    if (!p) return null;
    const v = [num(p.value), num(p.bf)].filter(x => x > 0);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  }
  function statusOf(model, ref) {
    const c = (model.catalog || {})[ref];
    return c && c.status ? c.status : '';
  }

  function compute(model, today) {
    today = today || new Date();
    today = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const P = Object.assign({ rendementSouhaite: 0.05, budgetMensuel: 300, valorisationParDefaut: 'theorique', decoteMonte: 0.3, decoteAbime: 0.1 }, model.params || {});
    const r = num(P.rendementSouhaite);
    const all = model.sets || [];
    const owned = all.filter(s => s.etat !== WISH);
    const wishlist = all.filter(s => s.etat === WISH);
    const prices = model.prices || {};
    const frais = model.frais || [];

    const fraisTotal = frais.reduce((t, f) => t + fraisAt(f, today), 0);
    const extrasTotal = frais.reduce((t, f) => t + extraAt(f, today), 0);
    const sumK = owned.reduce((t, s) => t + num(s.prixConseille), 0);

    const byRef = {};
    owned.forEach(s => {
      const o = byRef[s.ref] || (byRef[s.ref] = { qty: 0, sum: 0, n: 0 });
      o.qty++;
      if (num(s.prixAchat) > 0) { o.sum += num(s.prixAchat); o.n++; }
    });

    const decote = etat => etat === 'Monté' ? num(P.decoteMonte) : etat === 'Abîmé' ? num(P.decoteAbime) : 0;

    const rows = all.map(s => {
      const d = parseISO(s.dateAchat);
      const ref = byRef[s.ref] || { qty: 0, sum: 0, n: 0 };
      const achat = num(s.prixAchat), K = num(s.prixConseille);
      const avg = ref.n ? ref.sum / ref.n : 0;
      const years = d ? Math.floor((today - d) / DAY / 365) + 1 : null;
      const months = d ? Math.floor((today - d) / DAY / 30.4375) : null;
      const base = avg > 0 ? avg : K;
      const fraisStock = sumK ? K / sumK * fraisTotal : 0;
      const theo = d ? base * Math.pow(1 + r, years) + fraisStock : null;
      const mp = prices[s.ref];
      const mv = marketOf(mp);
      const marche = mv != null ? mv * (1 - decote(s.etat)) : null;
      let valeur, source;
      if (marche != null) { valeur = marche; source = 'marche'; }
      else if (P.valorisationParDefaut === 'conseille') { valeur = K || achat; source = 'conseille'; }
      else if (P.valorisationParDefaut === 'achat') { valeur = achat; source = 'achat'; }
      else { valeur = theo != null ? theo : (K || achat); source = 'theorique'; }
      // Set encore en vente chez LEGO et scellé : jamais valorisé sous son prix conseillé (si l'option est active).
      let plancher = false;
      if (num(P.plancherEnVente) && K > 0 && !decote(s.etat) && s.etat !== WISH && statusOf(model, s.ref) === 'En vente' && valeur < K) { valeur = K; plancher = true; }
      // Comme dans l'Excel : le gain d'un exemplaire se mesure face au prix moyen payé pour cette référence
      // (moyenne des prix d'achat non nuls), à défaut face au prix conseillé.
      const gain = valeur - base;
      return {
        s, qty: ref.qty, years, months, fraisStock, theo, marche, valeur, source, plancher, gain, prixMoyen: avg, coutBase: base,
        gainPct: base > 0 ? gain / base : null,
        bonneAffaire: achat > 0 && K > 0 && achat <= K * 0.85,
        priceInfo: mp || null,
        wish: s.etat === WISH
      };
    });
    const ownedRows = rows.filter(x => !x.wish);

    const sum = (arr, f) => arr.reduce((t, x) => t + f(x), 0);
    const totalAchat = sum(ownedRows, x => num(x.s.prixAchat));
    const totalValeur = sum(ownedRows, x => x.valeur);
    const totalConseille = sumK;
    const cadeaux = sum(ownedRows.filter(x => x.s.cadeau), x => num(x.s.prixAchat));
    const achatsHorsCadeaux = totalAchat - cadeaux;

    const dated = ownedRows.map(x => parseISO(x.s.dateAchat)).filter(Boolean).sort((a, b) => a - b);
    const first = dated[0] || today, last = dated[dated.length - 1] || today;
    const months = fullMonths(first, today);
    const days = Math.round((today - first) / DAY);
    const budgetHorsCadeaux = achatsHorsCadeaux - extrasTotal;
    const budgetTotal = budgetHorsCadeaux + fraisTotal;
    const B = num(P.budgetMensuel);
    const mensuelActuel = months ? (budgetHorsCadeaux + fraisTotal) / months : 0;
    const restant = months * B - budgetTotal;
    const joursAvantAchat = restant < 1 ? Math.ceil(Math.abs(restant) / Math.max(1, months * B / Math.max(1, days))) : 0;

    // Couverture prix marché
    const refsOwned = Object.keys(byRef);
    const refsPriced = refsOwned.filter(k => marketOf(prices[k]) != null);
    const marketRows = ownedRows.filter(x => x.source === 'marche');

    // Rendement annuel approx. (durée moyenne pondérée par le coût)
    const withCost = ownedRows.filter(x => num(x.s.prixAchat) > 0 && x.s.dateAchat);
    const C = sum(withCost, x => num(x.s.prixAchat));
    const V = sum(withCost, x => x.valeur);
    const yrs = C ? sum(withCost, x => num(x.s.prixAchat) * ((today - parseISO(x.s.dateAchat)) / DAY / 365.25)) / C : 0;
    const annuel = C && yrs > 0.25 ? Math.pow(V / C, 1 / yrs) - 1 : null;

    // Rentabilité d'un sous-ensemble d'exemplaires (prix d'achat réels, durée moyenne pondérée par le coût)
    function perf(list) {
      const achat = sum(list, x => num(x.s.prixAchat)), valeur = sum(list, x => x.valeur);
      const wc = list.filter(x => num(x.s.prixAchat) > 0 && x.s.dateAchat);
      const c = sum(wc, x => num(x.s.prixAchat)), v = sum(wc, x => x.valeur);
      const y = c ? sum(wc, x => num(x.s.prixAchat) * ((today - parseISO(x.s.dateAchat)) / DAY / 365.25)) / c : 0;
      return { n: list.length, achat, valeur, gain: valeur - achat, pct: achat ? (valeur - achat) / achat : null, annuel: c && y > 0.25 ? Math.pow(v / c, 1 / y) - 1 : null, ans: y };
    }
    const sealed = ownedRows.filter(x => x.s.etat !== 'Monté');
    const segments = {
      total: perf(ownedRows),
      scelles: perf(sealed),
      scellesRetires: perf(sealed.filter(x => statusOf(model, x.s.ref) === 'Retiré'))
    };

    function group(keyFn) {
      const g = {};
      ownedRows.forEach(x => {
        const k = keyFn(x) || '(vide)';
        const o = g[k] || (g[k] = { key: k, n: 0, achat: 0, valeur: 0, marche: 0 });
        o.n++; o.achat += num(x.s.prixAchat); o.valeur += x.valeur; if (x.source === 'marche') o.marche++;
      });
      return Object.values(g).map(o => Object.assign(o, { gain: o.valeur - o.achat, pct: o.achat ? (o.valeur - o.achat) / o.achat : null }));
    }

    // Série mensuelle : dépensé cumulé vs budget autorisé
    const timeline = [];
    if (dated.length) {
      const start = new Date(first.getFullYear(), first.getMonth(), 1);
      for (let t = new Date(start); t <= today; t = new Date(t.getFullYear(), t.getMonth() + 1, 1)) {
        const end = new Date(t.getFullYear(), t.getMonth() + 1, 0);
        const at = end > today ? today : end;
        const spent = sum(ownedRows.filter(x => !x.s.cadeau && x.s.dateAchat && parseISO(x.s.dateAchat) <= at), x => num(x.s.prixAchat))
          + frais.reduce((tt, f) => tt + fraisAt(f, at), 0);
        const allowed = fullMonths(first, at) * B + frais.reduce((tt, f) => tt + extraAt(f, at), 0);
        timeline.push({ month: iso(t).slice(0, 7), spent, allowed });
      }
    }

    return {
      P, rows, ownedRows, wishlist,
      totals: {
        n: ownedRows.length, refs: refsOwned.length, totalAchat, totalValeur, totalConseille, cadeaux,
        gain: totalValeur - totalAchat, gainPct: totalAchat ? (totalValeur - totalAchat) / totalAchat : null,
        fraisTotal, extrasTotal, budgetHorsCadeaux, budgetTotal, mensuelActuel, restant, joursAvantAchat,
        months, days, first: iso(first), last: iso(last), budgetMensuel: B,
        refsPriced: refsPriced.length, setsPriced: marketRows.length,
        marketAchat: sum(marketRows, x => num(x.s.prixAchat)), marketValeur: sum(marketRows, x => x.valeur),
        annuel, multiple: budgetTotal ? totalValeur / budgetTotal : null
      },
      segments, byTheme: group(x => x.s.serie),
      byYear: group(x => (x.s.dateAchat || '').slice(0, 4)),
      byPosition: group(x => x.s.position),
      timeline
    };
  }

  const api = { compute, marketOf, parseISO, iso, fullYears, fullMonths, extraAt, num, WISH };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Calc = api;
})(this);
