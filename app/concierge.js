/* Oira concierge (v2) - on-device advisory layer. See docs/CONCIERGE-ARCHITECTURE.md.
 * PRIVACY: only ever receives window.oiraBuildContext() (whitelisted, coarse). No selfie,
 * measurements, keys or wallet. Nothing here calls a server. Deterministic responder with
 * a multilingual layer; the Gemma model drops into respond() later behind the same boundary.
 * Languages here (en/fr/es/pt) are first-pass and cover large Global-South populations;
 * African-language fluency routes through the owned MMS/Gemma pipeline (native-reviewed).
 * Voice: warm, human, no em-dashes in user copy. Exposes window.OiraConcierge.
 */
(function () {
  // ---- shades: hex + multilingual trigger words (all map to one hex) ----
  const SHADES = [
    ['#C0192B', ['red','rouge','rojo','vermelho']],
    ['#8A2C4B', ['berry','baie','baya','frutos']],
    ['#5A1A2E', ['burgundy','maroon','wine','bordeaux','borgoña','vinho','bordô']],
    ['#E88AAE', ['pink','rose','rosa']],
    ['#E23E7A', ['hot pink','fuchsia','fucsia','magenta']],
    ['#E4694A', ['coral','corail','coralino','coral']],
    ['#E1662E', ['orange','naranja','laranja']],
    ['#B4633A', ['terracotta','terracota','terre cuite']],
    ['#C08A4A', ['camel','tan','camello','camelo']],
    ['#C9A24A', ['gold','or','dorado','dourado','ouro']],
    ['#C99A2E', ['mustard','moutarde','mostaza','mostarda']],
    ['#6E6E2E', ['olive','olivo','oliva']],
    ['#2F7D4F', ['green','vert','verde']],
    ['#0E6B5C', ['emerald','émeraude','esmeralda']],
    ['#0E7C82', ['teal','turquoise','turquesa']],
    ['#1E4FA0', ['blue','bleu','azul']],
    ['#1E2A5A', ['navy','marine','azul marino','azul-marinho']],
    ['#BEDCF0', ['icy blue','baby blue','bleu glacier','azul hielo','azul gelo']],
    ['#6A3AA0', ['purple','violet','púrpura','morado','roxo']],
    ['#B49BE0', ['lilac','lilas','lila','lilás','lavender','lavande','lavanda']],
    ['#111111', ['black','noir','negro','preto']],
    ['#FFFFFF', ['white','blanc','blanco','branco']],
    ['#5A3A24', ['brown','marron','marrón','marrom']],
    ['#D8B79A', ['nude','beige','bege']],
    ['#C8CCD0', ['silver','argent','plata','prata','grey','gray','gris','cinza']]
  ];
  const MODS = [ // modifier -> transform on {l,s}
    [['deep','dark','foncé','oscuro','escuro'], (o)=>({l:o.l*0.62,s:o.s})],
    [['pale','light','pastel','clair','claro','pálido'], (o)=>({l:Math.max(o.l,0.82),s:o.s*0.7})],
    [['bright','vivid','vif','vivo','brilhante','vivid'], (o)=>({l:o.l,s:Math.min(1,o.s*1.35)})],
    [['muted','dusty','soft','doux','apagado','suave'], (o)=>({l:o.l,s:o.s*0.55})]
  ];
  function hsl(hex){ hex=hex.replace('#',''); if(hex.length===3)hex=hex.split('').map(c=>c+c).join('');
    const r=parseInt(hex.slice(0,2),16)/255,g=parseInt(hex.slice(2,4),16)/255,b=parseInt(hex.slice(4,6),16)/255;
    const mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2,dd=mx-mn; let h=0,s=0;
    if(dd){ s=l>.5?dd/(2-mx-mn):dd/(mx+mn); h=mx===r?((g-b)/dd+(g<b?6:0)):mx===g?((b-r)/dd+2):((r-g)/dd+4); h*=60; }
    return {h,s,l}; }
  function findShade(q){ q=' '+q.toLowerCase()+' '; let best=null;
    for(const [hex,words] of SHADES) for(const w of words){ if(q.includes(' '+w+' ')||q.includes(' '+w+'?')||q.includes(' '+w+',')){ if(!best||w.length>best.word.length) best={hex,word:w}; } }
    if(!best) return null; let o=hsl(best.hex); let mod='';
    for(const [ws,fn] of MODS){ let hit=false; for(const w of ws){ if(q.includes(' '+w)){ o=fn(o); if(!mod)mod=w; hit=true; break; } } if(hit) break; }
    return { word: mod?mod+' '+best.word:best.word, o }; }
  // structured judgement (prose is rendered per language)
  function judge(o, ctx){
    let temp; if(o.h>=15&&o.h<=68) temp='warm'; else temp='cool';
    if(o.s<0.12) temp='neutral';
    const deep=o.l<0.42, pale=o.l>0.78||o.s<0.16;
    const uWarm=ctx.under==='Warm'||ctx.under==='Olive', uCool=ctx.under==='Cool', neutral=ctx.under==='Neutral';
    const herDeep = ctx.depthWord==='Deep'||ctx.depthNum>=3;
    const tempMatch = neutral||temp==='neutral'||(uWarm&&temp==='warm')||(uCool&&temp==='cool');
    let key; if(herDeep&&pale) key='wash'; else if(tempMatch) key='yours'; else key='clash';
    return { key, temp, deep, pale, warmer: uWarm };
  }
  // per-season best shades (english canonical + localized names below)
  const SEASON_SHADES = {
    'Deep Winter':['berry','emerald','navy','icy blue'], 'True Winter':['berry','fuchsia','navy','white'],
    'Cool Summer':['lilac','teal','rose','navy'], 'Deep Autumn':['terracotta','olive','gold','burgundy'],
    'Warm Autumn':['camel','rust','olive','mustard'], 'Warm Spring':['coral','camel','teal','gold']
  };
  const NAME = { // localized display names for the shades used in advice
    berry:{en:'berry',fr:'baie',es:'baya',pt:'frutas vermelhas'}, emerald:{en:'emerald',fr:'émeraude',es:'esmeralda',pt:'esmeralda'},
    navy:{en:'cool navy',fr:'bleu marine',es:'azul marino',pt:'azul-marinho'}, 'icy blue':{en:'icy blue',fr:'bleu glacier',es:'azul hielo',pt:'azul gelo'},
    fuchsia:{en:'fuchsia',fr:'fuchsia',es:'fucsia',pt:'fúcsia'}, white:{en:'clear white',fr:'blanc pur',es:'blanco puro',pt:'branco puro'},
    lilac:{en:'lilac',fr:'lilas',es:'lila',pt:'lilás'}, teal:{en:'teal',fr:'turquoise',es:'turquesa',pt:'turquesa'},
    rose:{en:'soft rose',fr:'rose doux',es:'rosa suave',pt:'rosa suave'}, terracotta:{en:'terracotta',fr:'terre cuite',es:'terracota',pt:'terracota'},
    olive:{en:'warm olive',fr:'olive',es:'oliva',pt:'oliva'}, gold:{en:'gold',fr:'doré',es:'dorado',pt:'dourado'},
    burgundy:{en:'burgundy',fr:'bordeaux',es:'borgoña',pt:'bordô'}, camel:{en:'camel',fr:'camel',es:'camello',pt:'camelo'},
    rust:{en:'rust',fr:'rouille',es:'óxido',pt:'ferrugem'}, mustard:{en:'mustard',fr:'moutarde',es:'mostaza',pt:'mostarda'},
    coral:{en:'coral',fr:'corail',es:'coral',pt:'coral'}
  };
  const list = (arr,lang)=>arr.map(k=>(NAME[k]&&NAME[k][lang])||k).join(', ');

  // ---- intents (keywords per language) ----
  const INTENTS = [
    ['greet', [/\b(hi|hey|hello)\b/, /\bbonjour|salut\b/, /\bhola\b/, /\bol[aá]|oi\b/]],
    ['overnight', [/slept|overnight|last night|tonight|happen/, /nuit|dormi|pendant que/, /noche|dormí|mientras/, /noite|dormi|enquanto/]],
    ['suit', [/suit|wear|for me|flatter|look good|can i/, /va|convient|porter|pour moi/, /queda|me va|llevar|favorece/, /combina|fica bem|usar|me cai/]],
    ['avoid', [/avoid|not wear|bad for|clash|worst/, /éviter|pas porter/, /evitar|no llevar/, /evitar|não usar/]],
    ['hair', [/hair|curl|coil|kink|braid|wash day|type ?4|4c|3c|hairstyle|head ?wrap|hijab/, /cheveux|boucl|fris[ée]|cr[éê]pu|coiffure|foulard/, /cabello|pelo|rizo|ondulad|peinado|pa[ñn]uelo/, /cabelo|cacho|crespo|penteado|len[çc]o/]],
    ['skin', [/dry skin|moistur|oily|shine|shiny|pores?\b|blemish|pimple|acne|breakout|skin condition/, /peau s[èe]che|hydrat|brilla|pores?\b|bouton|acn[ée]/, /piel seca|hidrat|brillo|poros?\b|grano|acn[eé]/, /pele seca|hidrat|brilho|poros?\b|espinha|acne/]],
    ['recommend', [/recommend|suggest|what should i|lipstick|foundation|which shade/, /recommande|conseille|rouge à lèvres|fond de teint/, /recomienda|sugiere|labial|base/, /recomenda|sugere|batom|base/]],
    ['season', [/season|my colou?rs|best colou?rs|palette/, /saison|mes couleurs|palette/, /temporada|estación|mis colores/, /estação|minhas cores|paleta/]],
    ['offers', [/offer|brand|budget|worth|question/, /offre|marque|budget/, /oferta|marca|presupuesto/, /oferta|marca|orçamento/]],
    ['earnings', [/earn|paid|money|made|income/, /gagn|payé|argent/, /gan|pagado|dinero/, /ganh|pago|dinheiro/]],
    ['rules', [/rule|block|floor|allow/, /règle|bloqu/, /regla|bloque/, /regra|bloque/]],
    ['recheck', [/recheck|again|update|changed|re-?read/, /revérifier|à nouveau|changé/, /revisar|otra vez|cambió/, /verificar de novo|mudou/]],
    ['privacy', [/private|safe|secure|data|selfie|face|leak/, /privé|sécur|données|visage/, /privado|segur|datos|cara/, /privado|segur|dados|rosto/]],
    ['history', [/checked|did i check|did i try|my checks|colou?r history/, /vérifié|essayé|mon historique/, /revisé|probé|mi historial/, /verifiquei|testei|meu histórico/]]
  ];
  const LANGS=['en','fr','es','pt'];
  // priority: explicit topics win before the broad "suit" matcher (so "what should I avoid" is
  // avoid, not a colourless suit that falls to help)
  const PRIORITY=['greet','overnight','avoid','hair','skin','recommend','season','offers','earnings','rules','recheck','privacy','history','suit'];
  function detect(q, lang){ q=' '+q.toLowerCase()+' '; const li=Math.max(0,LANGS.indexOf(lang));
    const by={}; for(const [n,res] of INTENTS) by[n]=res;
    for(const n of PRIORITY){ const r=by[n]&&by[n][li]; if(r&&r.test(q)) return n; }
    if(findShade(q)) return 'suit';
    return 'help'; }

  // ---- localized responses ----
  const cap=(s)=>s.charAt(0).toUpperCase()+s.slice(1);
  const T = {
    en:{ warm:'warm',cool:'cool',neutral:'neutral', warmer:'warmer',cooler:'cooler', soft:'soft',rich:'rich',deep:'deep',
      und:{Warm:'warm',Cool:'cool',Neutral:'neutral',Olive:'olive'}, ui:{title:'Ask Oira',sub:'Your private beauty concierge',ph:'Ask about your colours…',ask:'Ask',lang:'Language',thisShade:'This shade',photo:'A colour I photographed',listening:'Listening…'},
      greet:()=>`Hi. I am your Oira concierge. Ask what suits you, judge a shade before you buy, or ask what happened while you slept.`,
      suit:(w,j,ctx)=>{ const u=T.en.und[ctx.under]||'';
        if(j.key==='wash') return `${cap(w)}? Go a little richer. That is pale for your depth, and a deeper version of it will suit you more.`;
        if(j.key==='yours') return `${cap(w)}? Yes, this is yours. It is a ${j.temp} ${j.deep?'deep':j.pale?'soft':'clear'} shade that sits beautifully with your ${u} undertone.`;
        return `${cap(w)}? It leans ${j.temp}, and you are ${u}. A ${j.warmer?'warmer':'cooler'} version of it will flatter you more.`; },
      season:(ctx)=>`You are ${ctx.season}: a ${T.en.und[ctx.under]} undertone at ${(ctx.depthWord||'').toLowerCase()} depth. Your best shades: ${list(SEASON_SHADES[ctx.season]||[],'en')}. Ask me about any colour and I will place it for you.`,
      avoid:(ctx)=>`Go easy on shades that pull against you: for a ${T.en.und[ctx.under]} palette, very ${ctx.under==='Cool'?'orange and golden':'icy and blue-based'} tones fight your undertone. If you love one, choose a ${ctx.under==='Cool'?'cooler':'warmer'} version.`,
      hair:(ctx)=>{ const fam=ctx.curlFamily||'Curly', code=ctx.curl?` (type ${ctx.curl})`:'';
        const care={Straight:'lightweight care, a little volume at the root, and less oil than you think',Wavy:'a light cream to shape the wave and keep frizz down without weighing it flat',Curly:'a rich leave-in and curl cream, and the drier it feels the more moisture it is asking for',Coily:'deep moisture, real butters and oils, gentle detangling on wash day, and protective styles that hold. Your hair is not difficult, it is thirsty'}[fam]||'a rich leave-in and steady moisture';
        return `You've set your hair to ${fam}${code}. That calls for ${care}. When a brand offers hair products, your agent checks them against your curl type the same way it checks a colour, so you only ever see what actually fits you.`; },
      skin:(ctx)=>{ if(!ctx.skinDryness) return `I have not read your skin's condition yet. Do a scan and I can tell you about dryness and shine from today's light. Not a diagnosis, just a phone camera's best guess.`;
        const bits=[]; if(ctx.skinDryness==='dry') bits.push('a little dry today, a richer moisturizer would help'); else if(ctx.skinDryness==='hydrated') bits.push('reading hydrated'); else bits.push('reading balanced');
        if(ctx.skinShine==='shiny') bits.push('some shine building in your T-zone, a mattifying primer there would help');
        if(ctx.skinBlemish) bits.push('one small area looked a touch redder than the rest, nothing certain, worth a gentle spot treatment if you agree');
        return `Your skin is ${bits.join('; ')}. That is today's light, not a diagnosis, and I cannot see individual pores at a selfie camera's resolution, a dermatologist's tools go far beyond what a phone can measure.`; },
      recommend:(ctx)=>`For your ${ctx.season}, try ${list(SEASON_SHADES[ctx.season]||[],'en')}. A ${(NAME[(SEASON_SHADES[ctx.season]||['berry'])[0]]||{}).en||'rich'} is a safe, beautiful place to start.`,
      overnight:(ctx)=>ctx.earned>0?`While you slept, your agent answered privately inside the vault. A brand wanted your ${(ctx.depthWord||'').toLowerCase()} ${T.en.und[ctx.under]} shade, so you earned $${ctx.earned.toFixed(2)}. Only a yes was ever shared.`:`A quiet night so far. No offer met your rules, so nothing was answered and nothing was shared. Your reading stayed sealed.`,
      offers:()=>`Brands post offers for a shade and escrow the payout up front. Your agent only answers the ones that fit your palette and pass your rules. You are paid on a real match, and you never pay.`,
      earnings:(ctx)=>`You have earned $${(ctx.earned||0).toFixed(2)} so far, all from brands paying to reach your shade. Never from selling your data.`,
      rules:(ctx)=>`Tonight your agent answers offers worth at least $${(ctx.rules&&ctx.rules.minPayout||0.1).toFixed(2)}, at most ${ctx.rules&&ctx.rules.maxPerBrand||3} from one brand, and nothing in a category you blocked. Change these on the Night rules screen any time.`,
      recheck:()=>`Good instinct. Skin shifts a little with the seasons, so a quick monthly recheck keeps your palette honest. It takes one selfie and stays on your device until you confirm. Want to do one now?`,
      privacy:()=>`Your selfie never leaves your phone, and your exact reading never leaves the vault. I only see the season and undertone you already show yourself, never the raw numbers, your keys, or your wallet. The match is done with cryptography, not with me.`,
      help:()=>`I can tell you what suits you, judge a shade before you buy, explain how brands pay you, or read back your night. Try "does berry suit me?" or "what happened while I slept?".`,
      history:(ctx)=>{ const cs=ctx.checks||[]; return cs.length?`Lately you checked ${cs.slice(0,6).map(c=>`${c.n} (${c.g?'yours':'go easy'})`).join(', ')}.`:`You have not checked any colours yet. Tap Check a colour, or just ask me about a shade.`; },
      sugg:(ctx)=>['Does berry suit me?','What are my colours?',ctx.earned>0?'What happened while I slept?':'How do brands pay me?','Is my data safe?',...(ctx.skinDryness?['How is my skin today?']:[])] },

    fr:{ und:{Warm:'chaud',Cool:'froid',Neutral:'neutre',Olive:'olive'}, ui:{title:'Demandez à Oira',sub:'Votre conseillère beauté privée',ph:'Une question sur vos couleurs…',ask:'Demander',lang:'Langue',thisShade:'Cette teinte',photo:'Une couleur que j\'ai photographiée',listening:'À l\'écoute…'},
      greet:()=>`Bonjour. Je suis votre conseillère Oira. Demandez ce qui vous va, jugez une teinte avant d'acheter, ou demandez ce qui s'est passé pendant votre sommeil.`,
      suit:(w,j,ctx)=>{ const u=T.fr.und[ctx.under]||'';
        if(j.key==='wash') return `${cap(w)} ? Allez vers plus intense. C'est pâle pour votre profondeur, une version plus foncée vous ira mieux.`;
        if(j.key==='yours') return `${cap(w)} ? Oui, c'est pour vous. Une teinte ${j.temp==='warm'?'chaude':'froide'} qui s'accorde à votre sous-ton ${u}.`;
        return `${cap(w)} ? Elle tire vers le ${j.temp==='warm'?'chaud':'froid'}, et vous êtes ${u}. Une version plus ${j.warmer?'chaude':'froide'} vous flattera davantage.`; },
      season:(ctx)=>`Vous êtes ${ctx.season} : un sous-ton ${T.fr.und[ctx.under]}, en profondeur ${ctx.depthNum>=3?'profonde':'douce'}. Vos meilleures teintes : ${list(SEASON_SHADES[ctx.season]||[],'fr')}. Demandez-moi n'importe quelle couleur.`,
      avoid:(ctx)=>`Allez-y doucement sur les teintes qui vous contrarient : pour un sous-ton ${T.fr.und[ctx.under]}, les tons très ${ctx.under==='Cool'?'orangés et dorés':'glacés et bleutés'} luttent contre vous. Choisissez plutôt une version plus ${ctx.under==='Cool'?'froide':'chaude'}.`,
      hair:(ctx)=>{ const famEn=ctx.curlFamily||'Curly', code=ctx.curl?` (type ${ctx.curl})`:'';
        const famFr={Straight:'lisses',Wavy:'ondulés',Curly:'bouclés',Coily:'crépus'}[famEn]||'bouclés';
        const care={Straight:'un soin léger, du volume aux racines et peu d\'huile',Wavy:'une crème légère pour dessiner l\'ondulation sans l\'alourdir',Curly:'un leave-in riche et une crème boucles, et plus ils sont secs, plus ils réclament d\'hydratation',Coily:'une hydratation profonde, de vrais beurres et huiles, un démêlage doux le jour du lavage et des coiffures protectrices. Vos cheveux ne sont pas difficiles, ils ont soif'}[famEn]||'un leave-in riche et de l\'hydratation';
        return `Vos cheveux sont ${famFr}${code}. Il leur faut ${care}. Quand une marque propose des produits capillaires, votre agent les vérifie selon votre type de boucle, comme pour une couleur : vous ne voyez que ce qui vous convient.`; },
      skin:(ctx)=>{ if(!ctx.skinDryness) return `Je n'ai pas encore lu l'état de votre peau. Faites un scan et je pourrai vous parler de sécheresse et de brillance selon la lumière du jour. Pas un diagnostic, juste la meilleure estimation d'une caméra de téléphone.`;
        const bits=[]; if(ctx.skinDryness==='dry') bits.push('un peu sèche aujourd\'hui, une crème plus riche aiderait'); else if(ctx.skinDryness==='hydrated') bits.push('bien hydratée'); else bits.push('équilibrée');
        if(ctx.skinShine==='shiny') bits.push('un peu de brillance sur la zone T, un primer matifiant y aiderait');
        if(ctx.skinBlemish) bits.push('une petite zone semblait un peu plus rouge que le reste, rien de certain, un soin ciblé en douceur pourrait aider si vous êtes d\'accord');
        return `Votre peau est ${bits.join('; ')}. C'est la lumière d'aujourd'hui, pas un diagnostic, et je ne peux pas voir les pores individuels à la résolution d'une caméra de selfie, les outils d'un dermatologue vont bien au-delà de ce qu'un téléphone peut mesurer.`; },
      recommend:(ctx)=>`Pour votre saison ${ctx.season}, essayez ${list(SEASON_SHADES[ctx.season]||[],'fr')}. Une seule de ces teintes est déjà un beau point de départ.`,
      overnight:(ctx)=>ctx.earned>0?`Pendant votre sommeil, votre agent a répondu en privé dans le coffre. Une marque cherchait votre teinte, vous avez gagné ${ctx.earned.toFixed(2)} $. Seul un oui a été partagé.`:`Nuit calme pour l'instant. Aucune offre n'a satisfait vos règles, donc rien n'a été partagé. Votre lecture est restée scellée.`,
      offers:()=>`Les marques publient une offre pour une teinte et déposent le paiement d'avance. Votre agent ne répond qu'à celles qui vous vont et respectent vos règles, dans le coffre. Vous êtes payée à chaque vraie correspondance, vous ne payez jamais.`,
      earnings:(ctx)=>`Vous avez gagné ${(ctx.earned||0).toFixed(2)} $ jusqu'ici, grâce aux marques qui paient pour atteindre votre teinte. Jamais en vendant vos données.`,
      rules:(ctx)=>`Cette nuit, votre agent répond aux offres d'au moins ${(ctx.rules&&ctx.rules.minPayout||0.1).toFixed(2)} $, au plus ${ctx.rules&&ctx.rules.maxPerBrand||3} par marque, et rien dans une catégorie bloquée. Modifiable à tout moment.`,
      recheck:()=>`Bonne idée. La peau change avec les saisons, une petite revérification mensuelle garde votre palette juste. Un selfie suffit, il reste sur votre téléphone. On la fait maintenant ?`,
      privacy:()=>`Votre selfie ne quitte jamais votre téléphone, et votre lecture exacte ne quitte jamais le coffre. Je ne vois que la saison et le sous-ton que vous affichez déjà, jamais les chiffres bruts, vos clés ou votre portefeuille.`,
      help:()=>`Je peux vous dire ce qui vous va, juger une teinte avant l'achat, ou vous raconter votre nuit. Essayez « est-ce que le rouge me va ? ».`,
      history:(ctx)=>{ const cs=ctx.checks||[]; return cs.length?`Récemment vous avez vérifié ${cs.slice(0,6).map(c=>`${c.n} (${c.g?'pour vous':'doucement'})`).join(', ')}.`:`Vous n'avez encore vérifié aucune couleur. Touchez Vérifier une couleur, ou demandez-moi une teinte.`; },
      sugg:(ctx)=>['Est-ce que la baie me va ?','Quelles sont mes couleurs ?',ctx.earned>0?'Que s\'est-il passé cette nuit ?':'Comment les marques me paient ?','Mes données sont-elles protégées ?',...(ctx.skinDryness?['Comment est ma peau aujourd\'hui ?']:[])] },

    es:{ und:{Warm:'cálido',Cool:'frío',Neutral:'neutro',Olive:'oliva'}, ui:{title:'Pregunta a Oira',sub:'Tu asesora de belleza privada',ph:'Pregunta sobre tus colores…',ask:'Preguntar',lang:'Idioma',thisShade:'Este tono',photo:'Un color que fotografié',listening:'Escuchando…'},
      greet:()=>`Hola. Soy tu asesora de Oira. Pregunta qué te favorece, evalúa un tono antes de comprar, o pregunta qué pasó mientras dormías.`,
      suit:(w,j,ctx)=>{ const u=T.es.und[ctx.under]||'';
        if(j.key==='wash') return `¿${cap(w)}? Ve hacia algo más intenso. Es pálido para tu profundidad, y una versión más oscura te favorecerá más.`;
        if(j.key==='yours') return `¿${cap(w)}? Sí, es para ti. Un tono ${j.temp==='warm'?'cálido':'frío'} que combina con tu subtono ${u}.`;
        return `¿${cap(w)}? Tira a ${j.temp==='warm'?'cálido':'frío'}, y tú eres ${u}. Una versión más ${j.warmer?'cálida':'fría'} te favorecerá más.`; },
      season:(ctx)=>`Eres ${ctx.season}: un subtono ${T.es.und[ctx.under]}, de profundidad ${ctx.depthNum>=3?'profunda':'suave'}. Tus mejores tonos: ${list(SEASON_SHADES[ctx.season]||[],'es')}. Pregúntame por cualquier color.`,
      avoid:(ctx)=>`Ve con calma con los tonos que te restan: para un subtono ${T.es.und[ctx.under]}, los muy ${ctx.under==='Cool'?'anaranjados y dorados':'helados y azulados'} luchan contigo. Elige una versión más ${ctx.under==='Cool'?'fría':'cálida'}.`,
      hair:(ctx)=>{ const famEn=ctx.curlFamily||'Curly', code=ctx.curl?` (tipo ${ctx.curl})`:'';
        const famEs={Straight:'liso',Wavy:'ondulado',Curly:'rizado',Coily:'muy rizado (coily)'}[famEn]||'rizado';
        const care={Straight:'un cuidado ligero, volumen en la raíz y poco aceite',Wavy:'una crema ligera para definir la onda sin apelmazarla',Curly:'un leave-in rico y crema de rizos, y cuanto más seco, más hidratación pide',Coily:'hidratación profunda, mantecas y aceites de verdad, un desenredado suave el día de lavado y peinados protectores. Tu cabello no es difícil, tiene sed'}[famEn]||'un leave-in rico e hidratación';
        return `Tu cabello es ${famEs}${code}. Necesita ${care}. Cuando una marca ofrece productos para el cabello, tu agente los revisa según tu tipo de rizo, igual que un color: solo ves lo que te va.`; },
      skin:(ctx)=>{ if(!ctx.skinDryness) return `Aún no he leído el estado de tu piel. Haz un escaneo y podré hablarte de sequedad y brillo según la luz de hoy. No es un diagnóstico, solo la mejor estimación de una cámara de teléfono.`;
        const bits=[]; if(ctx.skinDryness==='dry') bits.push('un poco seca hoy, una crema más rica ayudaría'); else if(ctx.skinDryness==='hydrated') bits.push('bien hidratada'); else bits.push('equilibrada');
        if(ctx.skinShine==='shiny') bits.push('algo de brillo en tu zona T, un primer matificante ayudaría ahí');
        if(ctx.skinBlemish) bits.push('una pequeña zona se veía un poco más roja que el resto, nada seguro, un tratamiento localizado suave podría ayudar si estás de acuerdo');
        return `Tu piel está ${bits.join('; ')}. Es la luz de hoy, no un diagnóstico, y no puedo ver los poros individuales con la resolución de una cámara de selfie, las herramientas de un dermatólogo van mucho más allá de lo que un teléfono puede medir.`; },
      recommend:(ctx)=>`Para tu temporada ${ctx.season}, prueba ${list(SEASON_SHADES[ctx.season]||[],'es')}. Cualquiera de ellos es un bonito punto de partida.`,
      overnight:(ctx)=>ctx.earned>0?`Mientras dormías, tu agente respondió en privado dentro de la bóveda. Una marca quería tu tono, y ganaste $${ctx.earned.toFixed(2)}. Solo se compartió un sí.`:`Noche tranquila por ahora. Ninguna oferta cumplió tus reglas, así que no se compartió nada. Tu lectura siguió sellada.`,
      offers:()=>`Las marcas publican una oferta por un tono y depositan el pago por adelantado. Tu agente solo responde las que te favorecen y cumplen tus reglas, dentro de la bóveda. Te pagan en cada coincidencia real, tú nunca pagas.`,
      earnings:(ctx)=>`Has ganado $${(ctx.earned||0).toFixed(2)} hasta ahora, todo de marcas que pagan por llegar a tu tono. Nunca por vender tus datos.`,
      rules:(ctx)=>`Esta noche tu agente responde ofertas de al menos $${(ctx.rules&&ctx.rules.minPayout||0.1).toFixed(2)}, como máximo ${ctx.rules&&ctx.rules.maxPerBrand||3} por marca, y nada de una categoría bloqueada. Cámbialo cuando quieras.`,
      recheck:()=>`Buena idea. La piel cambia con las estaciones, así que una revisión mensual mantiene tu paleta al día. Basta un selfie y se queda en tu teléfono. ¿La hacemos ahora?`,
      privacy:()=>`Tu selfie nunca sale de tu teléfono, y tu lectura exacta nunca sale de la bóveda. Solo veo la temporada y el subtono que ya muestras, nunca los números en bruto, tus claves ni tu billetera.`,
      help:()=>`Puedo decirte qué te favorece, evaluar un tono antes de comprar, o contarte tu noche. Prueba "¿me queda el rojo?".`,
      history:(ctx)=>{ const cs=ctx.checks||[]; return cs.length?`Últimamente revisaste ${cs.slice(0,6).map(c=>`${c.n} (${c.g?'para ti':'con calma'})`).join(', ')}.`:`Aún no has revisado ningún color. Toca Revisar un color, o pregúntame por un tono.`; },
      sugg:(ctx)=>['¿Me queda la baya?','¿Cuáles son mis colores?',ctx.earned>0?'¿Qué pasó mientras dormía?':'¿Cómo me pagan las marcas?','¿Mis datos están seguros?',...(ctx.skinDryness?['¿Cómo está mi piel hoy?']:[])] },

    pt:{ und:{Warm:'quente',Cool:'frio',Neutral:'neutro',Olive:'oliva'}, ui:{title:'Pergunte à Oira',sub:'A sua consultora de beleza privada',ph:'Pergunte sobre as suas cores…',ask:'Perguntar',lang:'Idioma',thisShade:'Este tom',photo:'Uma cor que fotografei',listening:'A ouvir…'},
      greet:()=>`Olá. Sou a sua consultora Oira. Pergunte o que combina consigo, avalie um tom antes de comprar, ou pergunte o que aconteceu enquanto dormia.`,
      suit:(w,j,ctx)=>{ const u=T.pt.und[ctx.under]||'';
        if(j.key==='wash') return `${cap(w)}? Vá para algo mais intenso. É claro para a sua profundidade, e uma versão mais escura combina mais consigo.`;
        if(j.key==='yours') return `${cap(w)}? Sim, é a sua cor. Um tom ${j.temp==='warm'?'quente':'frio'} que combina com o seu subtom ${u}.`;
        return `${cap(w)}? Puxa para o ${j.temp==='warm'?'quente':'frio'}, e você é ${u}. Uma versão mais ${j.warmer?'quente':'fria'} favorece-a mais.`; },
      season:(ctx)=>`Você é ${ctx.season}: um subtom ${T.pt.und[ctx.under]}, de profundidade ${ctx.depthNum>=3?'profunda':'suave'}. Os seus melhores tons: ${list(SEASON_SHADES[ctx.season]||[],'pt')}. Pergunte-me por qualquer cor.`,
      avoid:(ctx)=>`Vá com calma nos tons que a contrariam: para um subtom ${T.pt.und[ctx.under]}, os muito ${ctx.under==='Cool'?'alaranjados e dourados':'gelados e azulados'} lutam consigo. Escolha uma versão mais ${ctx.under==='Cool'?'fria':'quente'}.`,
      hair:(ctx)=>{ const famEn=ctx.curlFamily||'Curly', code=ctx.curl?` (tipo ${ctx.curl})`:'';
        const famPt={Straight:'liso',Wavy:'ondulado',Curly:'cacheado',Coily:'crespo'}[famEn]||'cacheado';
        const care={Straight:'um cuidado leve, volume na raiz e pouco óleo',Wavy:'um creme leve para definir a onda sem pesar',Curly:'um leave-in encorpado e creme para cachos, e quanto mais seco, mais hidratação ele pede',Coily:'hidratação profunda, manteigas e óleos de verdade, desembaraço suave no dia da lavagem e penteados protetores. O seu cabelo não é difícil, ele tem sede'}[famEn]||'um leave-in encorpado e hidratação';
        return `O seu cabelo é ${famPt}${code}. Ele precisa de ${care}. Quando uma marca oferece produtos para cabelo, o seu agente verifica-os pelo seu tipo de cacho, como faz com uma cor: só vê o que combina consigo.`; },
      skin:(ctx)=>{ if(!ctx.skinDryness) return `Ainda não li o estado da sua pele. Faça um scan e poderei falar sobre secura e brilho conforme a luz de hoje. Não é um diagnóstico, apenas a melhor estimativa de uma câmara de telemóvel.`;
        const bits=[]; if(ctx.skinDryness==='dry') bits.push('um pouco seca hoje, um creme mais rico ajudaria'); else if(ctx.skinDryness==='hydrated') bits.push('bem hidratada'); else bits.push('equilibrada');
        if(ctx.skinShine==='shiny') bits.push('algum brilho na zona T, um primer matificante ajudaria aí');
        if(ctx.skinBlemish) bits.push('uma pequena área parecia um pouco mais vermelha que o resto, nada certo, um tratamento localizado suave pode ajudar se concordar');
        return `A sua pele está ${bits.join('; ')}. É a luz de hoje, não um diagnóstico, e não consigo ver poros individuais na resolução de uma câmara de selfie, as ferramentas de um dermatologista vão muito além do que um telemóvel consegue medir.`; },
      recommend:(ctx)=>`Para a sua estação ${ctx.season}, experimente ${list(SEASON_SHADES[ctx.season]||[],'pt')}. Qualquer um deles é um belo ponto de partida.`,
      overnight:(ctx)=>ctx.earned>0?`Enquanto dormia, o seu agente respondeu em privado dentro do cofre. Uma marca queria o seu tom, e você ganhou $${ctx.earned.toFixed(2)}. Apenas um sim foi partilhado.`:`Noite tranquila até agora. Nenhuma oferta cumpriu as suas regras, por isso nada foi partilhado. A sua leitura ficou selada.`,
      offers:()=>`As marcas publicam uma oferta por um tom e depositam o pagamento à frente. O seu agente só responde às que combinam consigo e cumprem as suas regras, dentro do cofre. É paga em cada correspondência real, você nunca paga.`,
      earnings:(ctx)=>`Você ganhou $${(ctx.earned||0).toFixed(2)} até agora, tudo de marcas que pagam para chegar ao seu tom. Nunca por vender os seus dados.`,
      rules:(ctx)=>`Esta noite o seu agente responde a ofertas de pelo menos $${(ctx.rules&&ctx.rules.minPayout||0.1).toFixed(2)}, no máximo ${ctx.rules&&ctx.rules.maxPerBrand||3} por marca, e nada de uma categoria bloqueada. Altere quando quiser.`,
      recheck:()=>`Boa ideia. A pele muda com as estações, por isso uma revisão mensal mantém a sua paleta em dia. Basta uma selfie e fica no seu telemóvel. Fazemos agora?`,
      privacy:()=>`A sua selfie nunca sai do seu telemóvel, e a sua leitura exata nunca sai do cofre. Só vejo a estação e o subtom que já mostra, nunca os números em bruto, as suas chaves ou a sua carteira.`,
      help:()=>`Posso dizer o que combina consigo, avaliar um tom antes de comprar, ou contar a sua noite. Experimente "o vermelho combina comigo?".`,
      history:(ctx)=>{ const cs=ctx.checks||[]; return cs.length?`Recentemente verificou ${cs.slice(0,6).map(c=>`${c.n} (${c.g?'a sua cor':'com calma'})`).join(', ')}.`:`Ainda não verificou nenhuma cor. Toque em Verificar uma cor, ou pergunte-me por um tom.`; },
      sugg:(ctx)=>['As frutas vermelhas combinam comigo?','Quais são as minhas cores?',ctx.earned>0?'O que aconteceu enquanto dormia?':'Como as marcas me pagam?','Os meus dados estão seguros?',...(ctx.skinDryness?['Como está a minha pele hoje?']:[])] }
  };

  let LANG = (localStorage.getItem('oira_lang') || (navigator.language||'en').slice(0,2).toLowerCase());
  if(!T[LANG]) LANG='en';
  function respond(intent, ctx, q){ const t=T[LANG]||T.en;
    if(intent==='suit'){ const f=findShade(q); if(!f) return t.season(ctx); return t.suit(f.word, judge(f.o,ctx), ctx); }
    return (t[intent]||t.help)(ctx, q); }

  const LOCALE={en:'en-US',fr:'fr-FR',es:'es-ES',pt:'pt-BR'};
  const OiraConcierge = {
    langs: LANGS, lang: ()=>LANG, locale(){ return LOCALE[LANG]||'en-US'; },
    setLang(l){ if(T[l]){ LANG=l; localStorage.setItem('oira_lang',l); } },
    ui(){ return (T[LANG]||T.en).ui; },
    greet(){ return (T[LANG]||T.en).greet(); },
    // the fully-static lines (no colour/season/amount slots) for the current language, used to
    // pre-warm the TTS cache so the most common spoken replies are free at runtime.
    staticLines(){ const t=T[LANG]||T.en; const ctx=(window.oiraBuildContext&&window.oiraBuildContext())||{};
      return [t.greet(), t.privacy(ctx), t.offers(ctx), t.recheck(ctx), t.help(ctx)]; },
    // judge a raw hex (e.g. a colour sampled from a photo she took) with the same logic + boundary,
    // then offer it to the SAME reasoning stack ask() uses (on-device Gemma -> governed server ->
    // deterministic floor) so a photographed colour gets her the same sharp, grounded voice as a
    // typed question, not a second-class rule-based-only answer.
    async judgeHex(hex){ const ctx=(window.oiraBuildContext&&window.oiraBuildContext())||{}; const t=T[LANG]||T.en;
      const draft=t.suit(t.ui.thisShade, judge(hsl(hex),ctx), ctx);
      const q=(t.ui.photo||'A colour I photographed')+' ('+hex+'). Does it suit me?';
      try{
        const LLM=(typeof window!=='undefined')&&window.OiraLLM;
        if(LLM && await LLM.available()){ const out=await LLM.generate(ctx, q, LANG, draft); if(out) return out; }
      }catch(e){}
      try{
        const R=(typeof window!=='undefined')&&window.OiraRemote;
        if(R && await R.available()){ const out=await R.generate(ctx, q, LANG, hex); if(out) return out; }
      }catch(e){}
      return draft; },
    suggestions(){ const ctx=(window.oiraBuildContext&&window.oiraBuildContext())||{}; return (T[LANG]||T.en).sugg(ctx); },
    async answer(q){ const ctx=(window.oiraBuildContext&&window.oiraBuildContext())||{}; const intent=detect(q||'',LANG);
      const draft=respond(intent, ctx, q||'');   // deterministic = grounded facts + always-on fallback
      // Reasoning layers, best-privacy first, each over the identical coarse-palette boundary:
      //  1) on-device Gemma 3n (nothing leaves the phone) when weights are present;
      //  2) the governed server concierge (/api/concierge, coarse palette only) for real reasoning
      //     on devices without local weights;
      //  3) the deterministic grounded draft, always-on floor.
      try{
        const LLM=(typeof window!=='undefined')&&window.OiraLLM;
        if(LLM && await LLM.available()){
          const out=await LLM.generate(ctx, q||'', LANG, draft);
          if(out) return { intent, text: out, via:'llm' };
        }
      }catch(e){}
      try{
        const R=(typeof window!=='undefined')&&window.OiraRemote;
        if(R && await R.available()){
          const out=await R.generate(ctx, q||'', LANG);
          if(out) return { intent, text: out, via:'remote' };
        }
      }catch(e){}
      return { intent, text: draft, via:'det' }; }
  };
  window.OiraConcierge = OiraConcierge;
})();
