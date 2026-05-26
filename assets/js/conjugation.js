/* =================================================================
   Conjugation — French verb conjugator.
   - Loads verbs.json (lazy) for group classification (1st/2nd/3rd).
   - Applies regular endings for -er and -ir/-iss verbs.
   - Includes a small irregular dictionary for the most common verbs.
   - Falls back to AI generation for everything else (uses AI.chatJSON).

   API:
     await Conjugation.lookup('parler')   -> {tenses, source, verb, ...}
     Conjugation.tensesList()             -> [['present','conj.tense.present'], …]
   ================================================================= */
(function (global) {
  'use strict';

  const PRONOUNS_FULL  = ['je', 'tu', 'il/elle', 'nous', 'vous', 'ils/elles'];

  /* -------------- Endings tables -------------- */
  const ER = {
    present:    ['e',   'es',  'e',   'ons', 'ez',  'ent'],
    imparfait:  ['ais', 'ais', 'ait', 'ions','iez', 'aient'],
    future:     ['ai',  'as',  'a',   'ons', 'ez',  'ont'],
    conditional:['ais', 'ais', 'ait', 'ions','iez', 'aient'],
    subjonctif: ['e',   'es',  'e',   'ions','iez', 'ent'],
    pastPart:   'é',
    auxiliary:  'avoir'
  };
  const IR2 = {
    present:    ['is',   'is',   'it',   'issons', 'issez', 'issent'],
    imparfait:  ['issais','issais','issait','issions','issiez','issaient'],
    future:     ['ai',   'as',   'a',    'ons',    'ez',    'ont'],
    conditional:['ais',  'ais',  'ait',  'ions',   'iez',   'aient'],
    subjonctif: ['isse', 'isses','isse', 'issions','issiez','issent'],
    pastPart:   'i',
    auxiliary:  'avoir'
  };

  const IRREGULAR = {
    'être': {
      present:     ['suis', 'es', 'est', 'sommes', 'êtes', 'sont'],
      imparfait:   ['étais','étais','était','étions','étiez','étaient'],
      future:      ['serai','seras','sera','serons','serez','seront'],
      conditional: ['serais','serais','serait','serions','seriez','seraient'],
      subjonctif:  ['sois','sois','soit','soyons','soyez','soient'],
      imperatif:   ['sois','soyons','soyez'],
      pastPart:    'été', auxiliary: 'avoir'
    },
    'avoir': {
      present:     ['ai','as','a','avons','avez','ont'],
      imparfait:   ['avais','avais','avait','avions','aviez','avaient'],
      future:      ['aurai','auras','aura','aurons','aurez','auront'],
      conditional: ['aurais','aurais','aurait','aurions','auriez','auraient'],
      subjonctif:  ['aie','aies','ait','ayons','ayez','aient'],
      imperatif:   ['aie','ayons','ayez'],
      pastPart:    'eu', auxiliary: 'avoir'
    },
    'aller': {
      present:     ['vais','vas','va','allons','allez','vont'],
      imparfait:   ['allais','allais','allait','allions','alliez','allaient'],
      future:      ['irai','iras','ira','irons','irez','iront'],
      conditional: ['irais','irais','irait','irions','iriez','iraient'],
      subjonctif:  ['aille','ailles','aille','allions','alliez','aillent'],
      imperatif:   ['va','allons','allez'],
      pastPart:    'allé', auxiliary: 'être'
    },
    'faire': {
      present:     ['fais','fais','fait','faisons','faites','font'],
      imparfait:   ['faisais','faisais','faisait','faisions','faisiez','faisaient'],
      future:      ['ferai','feras','fera','ferons','ferez','feront'],
      conditional: ['ferais','ferais','ferait','ferions','feriez','feraient'],
      subjonctif:  ['fasse','fasses','fasse','fassions','fassiez','fassent'],
      imperatif:   ['fais','faisons','faites'],
      pastPart:    'fait', auxiliary: 'avoir'
    },
    'dire': {
      present:     ['dis','dis','dit','disons','dites','disent'],
      imparfait:   ['disais','disais','disait','disions','disiez','disaient'],
      future:      ['dirai','diras','dira','dirons','direz','diront'],
      conditional: ['dirais','dirais','dirait','dirions','diriez','diraient'],
      subjonctif:  ['dise','dises','dise','disions','disiez','disent'],
      imperatif:   ['dis','disons','dites'],
      pastPart:    'dit', auxiliary: 'avoir'
    },
    'voir': {
      present:     ['vois','vois','voit','voyons','voyez','voient'],
      imparfait:   ['voyais','voyais','voyait','voyions','voyiez','voyaient'],
      future:      ['verrai','verras','verra','verrons','verrez','verront'],
      conditional: ['verrais','verrais','verrait','verrions','verriez','verraient'],
      subjonctif:  ['voie','voies','voie','voyions','voyiez','voient'],
      imperatif:   ['vois','voyons','voyez'],
      pastPart:    'vu', auxiliary: 'avoir'
    },
    'prendre': {
      present:     ['prends','prends','prend','prenons','prenez','prennent'],
      imparfait:   ['prenais','prenais','prenait','prenions','preniez','prenaient'],
      future:      ['prendrai','prendras','prendra','prendrons','prendrez','prendront'],
      conditional: ['prendrais','prendrais','prendrait','prendrions','prendriez','prendraient'],
      subjonctif:  ['prenne','prennes','prenne','prenions','preniez','prennent'],
      imperatif:   ['prends','prenons','prenez'],
      pastPart:    'pris', auxiliary: 'avoir'
    },
    'mettre': {
      present:     ['mets','mets','met','mettons','mettez','mettent'],
      imparfait:   ['mettais','mettais','mettait','mettions','mettiez','mettaient'],
      future:      ['mettrai','mettras','mettra','mettrons','mettrez','mettront'],
      conditional: ['mettrais','mettrais','mettrait','mettrions','mettriez','mettraient'],
      subjonctif:  ['mette','mettes','mette','mettions','mettiez','mettent'],
      imperatif:   ['mets','mettons','mettez'],
      pastPart:    'mis', auxiliary: 'avoir'
    },
    'savoir': {
      present:     ['sais','sais','sait','savons','savez','savent'],
      imparfait:   ['savais','savais','savait','savions','saviez','savaient'],
      future:      ['saurai','sauras','saura','saurons','saurez','sauront'],
      conditional: ['saurais','saurais','saurait','saurions','sauriez','sauraient'],
      subjonctif:  ['sache','saches','sache','sachions','sachiez','sachent'],
      imperatif:   ['sache','sachons','sachez'],
      pastPart:    'su', auxiliary: 'avoir'
    },
    'pouvoir': {
      present:     ['peux','peux','peut','pouvons','pouvez','peuvent'],
      imparfait:   ['pouvais','pouvais','pouvait','pouvions','pouviez','pouvaient'],
      future:      ['pourrai','pourras','pourra','pourrons','pourrez','pourront'],
      conditional: ['pourrais','pourrais','pourrait','pourrions','pourriez','pourraient'],
      subjonctif:  ['puisse','puisses','puisse','puissions','puissiez','puissent'],
      imperatif:   [],
      pastPart:    'pu', auxiliary: 'avoir'
    },
    'vouloir': {
      present:     ['veux','veux','veut','voulons','voulez','veulent'],
      imparfait:   ['voulais','voulais','voulait','voulions','vouliez','voulaient'],
      future:      ['voudrai','voudras','voudra','voudrons','voudrez','voudront'],
      conditional: ['voudrais','voudrais','voudrait','voudrions','voudriez','voudraient'],
      subjonctif:  ['veuille','veuilles','veuille','voulions','vouliez','veuillent'],
      imperatif:   ['veuille','veuillons','veuillez'],
      pastPart:    'voulu', auxiliary: 'avoir'
    },
    'devoir': {
      present:     ['dois','dois','doit','devons','devez','doivent'],
      imparfait:   ['devais','devais','devait','devions','deviez','devaient'],
      future:      ['devrai','devras','devra','devrons','devrez','devront'],
      conditional: ['devrais','devrais','devrait','devrions','devriez','devraient'],
      subjonctif:  ['doive','doives','doive','devions','deviez','doivent'],
      imperatif:   [],
      pastPart:    'dû', auxiliary: 'avoir'
    },
    'venir': {
      present:     ['viens','viens','vient','venons','venez','viennent'],
      imparfait:   ['venais','venais','venait','venions','veniez','venaient'],
      future:      ['viendrai','viendras','viendra','viendrons','viendrez','viendront'],
      conditional: ['viendrais','viendrais','viendrait','viendrions','viendriez','viendraient'],
      subjonctif:  ['vienne','viennes','vienne','venions','veniez','viennent'],
      imperatif:   ['viens','venons','venez'],
      pastPart:    'venu', auxiliary: 'être'
    },
    'partir': {
      present:     ['pars','pars','part','partons','partez','partent'],
      imparfait:   ['partais','partais','partait','partions','partiez','partaient'],
      future:      ['partirai','partiras','partira','partirons','partirez','partiront'],
      conditional: ['partirais','partirais','partirait','partirions','partiriez','partiraient'],
      subjonctif:  ['parte','partes','parte','partions','partiez','partent'],
      imperatif:   ['pars','partons','partez'],
      pastPart:    'parti', auxiliary: 'être'
    },
    'sortir': {
      present:     ['sors','sors','sort','sortons','sortez','sortent'],
      imparfait:   ['sortais','sortais','sortait','sortions','sortiez','sortaient'],
      future:      ['sortirai','sortiras','sortira','sortirons','sortirez','sortiront'],
      conditional: ['sortirais','sortirais','sortirait','sortirions','sortiriez','sortiraient'],
      subjonctif:  ['sorte','sortes','sorte','sortions','sortiez','sortent'],
      imperatif:   ['sors','sortons','sortez'],
      pastPart:    'sorti', auxiliary: 'être'
    },
    'dormir': {
      present:     ['dors','dors','dort','dormons','dormez','dorment'],
      imparfait:   ['dormais','dormais','dormait','dormions','dormiez','dormaient'],
      future:      ['dormirai','dormiras','dormira','dormirons','dormirez','dormiront'],
      conditional: ['dormirais','dormirais','dormirait','dormirions','dormiriez','dormiraient'],
      subjonctif:  ['dorme','dormes','dorme','dormions','dormiez','dorment'],
      imperatif:   ['dors','dormons','dormez'],
      pastPart:    'dormi', auxiliary: 'avoir'
    },
    'lire': {
      present:     ['lis','lis','lit','lisons','lisez','lisent'],
      imparfait:   ['lisais','lisais','lisait','lisions','lisiez','lisaient'],
      future:      ['lirai','liras','lira','lirons','lirez','liront'],
      conditional: ['lirais','lirais','lirait','lirions','liriez','liraient'],
      subjonctif:  ['lise','lises','lise','lisions','lisiez','lisent'],
      imperatif:   ['lis','lisons','lisez'],
      pastPart:    'lu', auxiliary: 'avoir'
    },
    'écrire': {
      present:     ['écris','écris','écrit','écrivons','écrivez','écrivent'],
      imparfait:   ['écrivais','écrivais','écrivait','écrivions','écriviez','écrivaient'],
      future:      ['écrirai','écriras','écrira','écrirons','écrirez','écriront'],
      conditional: ['écrirais','écrirais','écrirait','écririons','écririez','écriraient'],
      subjonctif:  ['écrive','écrives','écrive','écrivions','écriviez','écrivent'],
      imperatif:   ['écris','écrivons','écrivez'],
      pastPart:    'écrit', auxiliary: 'avoir'
    },
    'connaître': {
      present:     ['connais','connais','connaît','connaissons','connaissez','connaissent'],
      imparfait:   ['connaissais','connaissais','connaissait','connaissions','connaissiez','connaissaient'],
      future:      ['connaîtrai','connaîtras','connaîtra','connaîtrons','connaîtrez','connaîtront'],
      conditional: ['connaîtrais','connaîtrais','connaîtrait','connaîtrions','connaîtriez','connaîtraient'],
      subjonctif:  ['connaisse','connaisses','connaisse','connaissions','connaissiez','connaissent'],
      imperatif:   ['connais','connaissons','connaissez'],
      pastPart:    'connu', auxiliary: 'avoir'
    },
    'attendre': {
      present:     ['attends','attends','attend','attendons','attendez','attendent'],
      imparfait:   ['attendais','attendais','attendait','attendions','attendiez','attendaient'],
      future:      ['attendrai','attendras','attendra','attendrons','attendrez','attendront'],
      conditional: ['attendrais','attendrais','attendrait','attendrions','attendriez','attendraient'],
      subjonctif:  ['attende','attendes','attende','attendions','attendiez','attendent'],
      imperatif:   ['attends','attendons','attendez'],
      pastPart:    'attendu', auxiliary: 'avoir'
    }
  };

  /* -------------- verbs.json cache -------------- */
  let verbsIndex = null;
  let verbsLoadingPromise = null;

  function loadVerbsIndex() {
    if (verbsIndex) return Promise.resolve(verbsIndex);
    if (verbsLoadingPromise) return verbsLoadingPromise;
    verbsLoadingPromise = fetch('verbs.json', { cache: 'force-cache' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('verbs.json HTTP ' + r.status)))
      .then(json => {
        const idx = Object.create(null);
        const groups = json && json.verbs ? json.verbs : {};
        ['first_group','second_group','third_group'].forEach(g => {
          (groups[g] || []).forEach(v => { idx[String(v).toLowerCase()] = g; });
        });
        verbsIndex = idx;
        return idx;
      })
      .catch(err => {
        console.warn('[Conjugation] verbs.json load failed:', err.message);
        verbsIndex = Object.create(null);
        return verbsIndex;
      });
    return verbsLoadingPromise;
  }

  function classifyHeuristic(verb) {
    const v = (verb || '').toLowerCase();
    if (v.endsWith('er')) return 'first_group';
    if (v.endsWith('ir')) return 'second_group';
    if (v.endsWith('re') || v.endsWith('oir')) return 'third_group';
    return 'third_group';
  }

  function classify(verb) {
    const v = (verb || '').toLowerCase().trim();
    if (verbsIndex && verbsIndex[v]) return verbsIndex[v];
    return classifyHeuristic(v);
  }

  function elidedJe(form) {
    return /^[aeiouhâéèêëîïôöùûü]/i.test(form) ? `j'${form}` : `je ${form}`;
  }

  function withPronouns(forms) {
    if (!Array.isArray(forms) || forms.length !== 6) return null;
    return [
      elidedJe(forms[0]),
      `tu ${forms[1]}`,
      `il/elle ${forms[2]}`,
      `nous ${forms[3]}`,
      `vous ${forms[4]}`,
      `ils/elles ${forms[5]}`
    ];
  }

  function imperativeForms(forms) {
    if (!Array.isArray(forms) || forms.length === 0) return [];
    if (forms.length === 3) {
      return [`(tu) ${forms[0]}`, `(nous) ${forms[1]}`, `(vous) ${forms[2]}`];
    }
    return forms;
  }

  function conjugateRegularER(verb) {
    const stem = verb.slice(0, -2);
    return {
      present:    ER.present.map(e => stem + e),
      imparfait:  ER.imparfait.map(e => stem + e),
      future:     ER.future.map(e => verb + e),
      conditional:ER.conditional.map(e => verb + e),
      subjonctif: ER.subjonctif.map(e => stem + e),
      imperatif:  [stem + 'e', stem + 'ons', stem + 'ez'],
      pastPart:   stem + ER.pastPart,
      auxiliary:  ER.auxiliary
    };
  }

  function conjugateRegularIR(verb) {
    const stem = verb.slice(0, -2);
    return {
      present:    IR2.present.map(e => stem + e),
      imparfait:  IR2.imparfait.map(e => stem + e),
      future:     IR2.future.map(e => verb + e),
      conditional:IR2.conditional.map(e => verb + e),
      subjonctif: IR2.subjonctif.map(e => stem + e),
      imperatif:  [stem + 'is', stem + 'issons', stem + 'issez'],
      pastPart:   stem + IR2.pastPart,
      auxiliary:  IR2.auxiliary
    };
  }

  function buildCompound(aux, participle) {
    const auxData = IRREGULAR[aux === 'être' ? 'être' : 'avoir'];
    const present  = auxData.present;
    const imparfait = auxData.imparfait;
    return {
      passeCompose: present.map(p => `${p} ${participle}`),
      plusquepar:   imparfait.map(p => `${p} ${participle}`)
    };
  }

  async function lookup(verb) {
    const v = (verb || '').trim().toLowerCase();
    if (!v) throw new Error('No verb provided');

    await loadVerbsIndex();

    if (IRREGULAR[v]) {
      const r = IRREGULAR[v];
      const compound = buildCompound(r.auxiliary, r.pastPart);
      return {
        verb: v, source: 'offline', group: classify(v),
        auxiliary: r.auxiliary, pastPart: r.pastPart,
        tenses: {
          present: withPronouns(r.present),
          passeCompose: withPronouns(compound.passeCompose),
          imparfait: withPronouns(r.imparfait),
          future: withPronouns(r.future),
          conditional: withPronouns(r.conditional),
          subjonctif: withPronouns(r.subjonctif).map(s => 'que ' + s),
          imperatif: imperativeForms(r.imperatif),
          plusquepar: withPronouns(compound.plusquepar)
        }
      };
    }

    if (v.endsWith('er') && classify(v) !== 'third_group') {
      const r = conjugateRegularER(v);
      const compound = buildCompound(r.auxiliary, r.pastPart);
      return {
        verb: v, source: 'offline', group: 'first_group',
        auxiliary: r.auxiliary, pastPart: r.pastPart,
        tenses: {
          present: withPronouns(r.present),
          passeCompose: withPronouns(compound.passeCompose),
          imparfait: withPronouns(r.imparfait),
          future: withPronouns(r.future),
          conditional: withPronouns(r.conditional),
          subjonctif: withPronouns(r.subjonctif).map(s => 'que ' + s),
          imperatif: imperativeForms(r.imperatif),
          plusquepar: withPronouns(compound.plusquepar)
        }
      };
    }

    if (v.endsWith('ir') && classify(v) === 'second_group') {
      const r = conjugateRegularIR(v);
      const compound = buildCompound(r.auxiliary, r.pastPart);
      return {
        verb: v, source: 'offline', group: 'second_group',
        auxiliary: r.auxiliary, pastPart: r.pastPart,
        tenses: {
          present: withPronouns(r.present),
          passeCompose: withPronouns(compound.passeCompose),
          imparfait: withPronouns(r.imparfait),
          future: withPronouns(r.future),
          conditional: withPronouns(r.conditional),
          subjonctif: withPronouns(r.subjonctif).map(s => 'que ' + s),
          imperatif: imperativeForms(r.imperatif),
          plusquepar: withPronouns(compound.plusquepar)
        }
      };
    }

    if (global.AI && global.AI.isReady()) {
      const ai = await aiConjugate(v);
      if (ai) return ai;
    }

    return null;
  }

  async function aiConjugate(verb) {
    const sys = `You are a French conjugation engine. For the given infinitive, return STRICT JSON with this shape:
{
  "verb": "<infinitive>",
  "auxiliary": "avoir" | "être",
  "pastPart": "<past participle>",
  "tenses": {
    "present":      ["je …","tu …","il/elle …","nous …","vous …","ils/elles …"],
    "passeCompose": ["j'ai/je suis …", … 6 forms],
    "imparfait":    [6 forms with pronouns],
    "future":       [6 forms with pronouns],
    "conditional":  [6 forms with pronouns],
    "subjonctif":   ["que je …", … 6 forms],
    "imperatif":    ["(tu) …","(nous) …","(vous) …"],
    "plusquepar":   [6 forms with pronouns]
  }
}
No prose, no markdown — only the JSON object.`;
    try {
      const r = await global.AI.chatJSON([
        { role: 'system', content: sys },
        { role: 'user', content: `Infinitive: ${verb}` }
      ], { temperature: 0.1 });
      const j = r.json;
      if (!j || !j.tenses) return null;
      const required = ['present','passeCompose','imparfait','future','conditional','subjonctif','imperatif','plusquepar'];
      for (const k of required) {
        if (!Array.isArray(j.tenses[k])) j.tenses[k] = [];
      }
      return {
        verb, source: 'ai', group: classify(verb),
        auxiliary: j.auxiliary || 'avoir',
        pastPart: j.pastPart || '',
        tenses: j.tenses
      };
    } catch (e) {
      console.warn('[Conjugation] AI fallback failed:', e.message);
      return null;
    }
  }

  function shortSummary(conj) {
    if (!conj || !conj.tenses || !Array.isArray(conj.tenses.present)) return '';
    return conj.tenses.present.slice(0, 3).join(', ');
  }

  global.Conjugation = {
    PRONOUNS_FULL,
    classify,
    loadVerbsIndex,
    lookup,
    shortSummary,
    tensesList() {
      return [
        ['present',     'conj.tense.present'],
        ['passeCompose','conj.tense.passeCompose'],
        ['imparfait',   'conj.tense.imparfait'],
        ['future',      'conj.tense.future'],
        ['conditional', 'conj.tense.conditional'],
        ['subjonctif',  'conj.tense.subjonctif'],
        ['imperatif',   'conj.tense.imperatif'],
        ['plusquepar',  'conj.tense.plusquepar']
      ];
    }
  };
})(window);
