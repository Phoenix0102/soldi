/* Percorso di educazione finanziaria.
   Le idee sono riassunte e adattate al contesto italiano; i libri sono citati come fonte, non trascritti. */

export type Block =
  | { t: 'p'; text: string }
  | { t: 'key'; text: string }
  | { t: 'example'; title: string; text: string }
  | { t: 'do'; items: string[] }

export interface Question { q: string; options: string[]; correct: number; explain: string }

export type ApplyKey = 'hours' | 'networth' | 'savings' | 'budget503020' | 'emergency' | 'debts' | 'subscriptions' | 'compound' | 'fi'

export interface Lesson {
  id: string
  module: string
  title: string
  summary: string
  minutes: number
  books: string[]
  body: Block[]
  apply?: ApplyKey
  quiz: Question[]
}

export interface Module { id: string; title: string; text: string }

export const MODULES: Module[] = [
  { id: 'mentalita', title: 'La mentalità', text: 'Prima dei numeri viene il modo in cui pensi ai soldi.' },
  { id: 'fondamenta', title: 'Le fondamenta', text: 'Sapere dove sei, risparmiare per primo, dare un compito a ogni euro.' },
  { id: 'sicurezza', title: 'La rete di sicurezza', text: 'Imprevisti, debiti e spese che non vedi.' },
  { id: 'crescita', title: 'Far crescere i soldi', text: 'Tempo, inflazione, ETF e rischio, spiegati senza gergo.' },
  { id: 'futuro', title: 'Il futuro', text: 'Pensione, TFR e la libertà di scegliere se lavorare.' },
  { id: 'trappole', title: 'Le trappole', text: 'Gli errori che costano di più, e come riconoscerli.' },
]

export const LESSONS: Lesson[] = [
  /* ---------------- MENTALITÀ ---------------- */
  {
    id: 'comportamento', module: 'mentalita', minutes: 4,
    title: 'Con i soldi conta più il comportamento dell\'intelligenza',
    summary: 'Perché persone normali diventano benestanti e persone brillanti finiscono al verde.',
    books: ['Morgan Housel, La psicologia dei soldi'],
    body: [
      { t: 'p', text: 'L\'idea centrale di Housel è semplice: gestire bene i soldi dipende poco da quanto sei bravo con i numeri e molto da come ti comporti, soprattutto nei momenti di paura o di euforia. Un custode che risparmia per quarant\'anni e investe con costanza può finire più ricco di un manager con uno stipendio enorme che spende tutto.' },
      { t: 'key', text: 'Non serve essere perfettamente **razionali**. Serve essere **ragionevoli**: scegliere una strategia buona che riesci davvero a mantenere per anni.' },
      { t: 'p', text: 'Tre idee del libro che ti torneranno utili ovunque in questo percorso:' },
      { t: 'p', text: '**Il tempo è la leva più potente.** Gran parte della ricchezza di Warren Buffett è arrivata dopo i 60 anni, non perché sia diventato più bravo, ma perché ha iniziato prestissimo e non si è mai fermato. A 21 anni il tuo vantaggio più grande è proprio il tempo.' },
      { t: 'p', text: '**Lascia un margine di errore.** Il futuro non va mai come previsto. Chi ha un cuscinetto di liquidità e non è indebitato sopravvive agli imprevisti, e chi sopravvive resta in gioco abbastanza a lungo da vedere l\'interesse composto lavorare.' },
      { t: 'p', text: '**La ricchezza è quello che non vedi.** Un\'auto nuova mostra quanto hai speso, non quanto possiedi. La ricchezza vera sono i soldi che hai scelto di non spendere.' },
      { t: 'do', items: ['Registra le spese per un mese intero senza giudicarti: l\'obiettivo è osservare.', 'Scrivi in una riga perché vuoi gestire meglio i soldi. Ti servirà nei momenti di tentazione.'] },
    ],
    quiz: [
      { q: 'Secondo Housel, cosa conta di più per avere successo con i soldi?', options: ['Il quoziente intellettivo', 'Il comportamento nel tempo', 'Conoscere la finanza avanzata', 'Avere fortuna nei primi investimenti'], correct: 1, explain: 'Il libro mostra che costanza, pazienza e controllo delle emozioni battono quasi sempre l\'intelligenza pura.' },
      { q: 'Perché iniziare a 21 anni è un vantaggio?', options: ['Perché a quell\'età i rendimenti sono più alti', 'Perché hai più anni in cui l\'interesse composto può lavorare', 'Perché le tasse sono più basse', 'Non è un vantaggio reale'], correct: 1, explain: 'L\'interesse composto cresce con il tempo: ogni anno in più fa crescere anche i guadagni degli anni precedenti.' },
      { q: 'Cosa significa "lasciare un margine di errore"?', options: ['Investire tutto nell\'asset più promettente', 'Tenere riserve e non dipendere dal fatto che tutto vada bene', 'Accettare di perdere soldi ogni anno', 'Calcolare i rendimenti con due decimali'], correct: 1, explain: 'Riserve di liquidità e pochi debiti permettono di affrontare gli imprevisti senza dover vendere o indebitarsi nel momento peggiore.' },
    ],
  },
  {
    id: 'ore-di-vita', module: 'mentalita', minutes: 4, apply: 'hours',
    title: 'Quanto ti costa davvero: le ore di vita',
    summary: 'Trasforma i prezzi in ore di lavoro e guarda le tue spese con occhi nuovi.',
    books: ['Vicki Robin e Joe Dominguez, Your Money or Your Life (O la borsa o la vita)'],
    body: [
      { t: 'p', text: 'Robin e Dominguez propongono un esercizio che cambia il modo di vedere i prezzi: i soldi sono l\'energia vitale che scambi con il tuo tempo. Ogni spesa quindi costa un certo numero di **ore della tua vita**.' },
      { t: 'p', text: 'Per farlo bene serve la tua **paga oraria reale**: prendi quello che guadagni netto al mese, togli i costi che sostieni solo per lavorare (trasporti, pranzi fuori, abiti da lavoro) e dividi per le ore che il lavoro ti occupa davvero, spostamenti compresi.' },
      { t: 'example', title: 'Un esempio', text: 'Guadagni 1.400 € netti e spendi 150 € al mese per andare al lavoro. Tra lavoro e tragitto ci passi 190 ore al mese. La tua paga reale è (1.400 − 150) / 190, cioè circa 6,60 € l\'ora. Uno smartphone da 900 € ti costa quindi circa 136 ore, quasi un mese di lavoro.' },
      { t: 'key', text: 'L\'obiettivo non è smettere di comprare. È chiederti, per ogni spesa: **vale le ore di vita che mi costa?** Se sì, comprala senza sensi di colpa.' },
      { t: 'p', text: 'Il libro suggerisce anche di valutare ogni categoria di spesa con due domande: questa spesa mi ha dato soddisfazione proporzionata alle ore? Cambierebbe se vivessi secondo i miei valori? Spesso scopri spese che non ti danno quasi nulla, ed è lì che tagliare non costa fatica.' },
      { t: 'do', items: ['Calcola la tua paga oraria reale qui sotto.', 'Guarda le 5 spese più grandi del mese e convertile in ore.'] },
    ],
    quiz: [
      { q: 'Come si calcola la paga oraria reale?', options: ['Stipendio lordo diviso 160 ore', 'Netto meno i costi del lavoro, diviso le ore totali dedicate al lavoro', 'Netto diviso i giorni del mese', 'Stipendio lordo meno le tasse'], correct: 1, explain: 'Contano solo i soldi che restano davvero e tutto il tempo che il lavoro ti prende, tragitti compresi.' },
      { q: 'Qual è lo scopo dell\'esercizio delle ore di vita?', options: ['Spendere il meno possibile in assoluto', 'Valutare se una spesa vale il tempo che ti costa', 'Chiedere un aumento', 'Calcolare le tasse'], correct: 1, explain: 'È uno strumento di consapevolezza: alcune spese valgono le ore, altre no.' },
      { q: 'Paga reale 8 € l\'ora. Un abbonamento da 16 € al mese ti costa all\'anno circa…', options: ['2 ore', '12 ore', '24 ore', '48 ore'], correct: 2, explain: '16 € × 12 = 192 € all\'anno, diviso 8 € l\'ora fa 24 ore di lavoro.' },
    ],
  },
  {
    id: 'abbastanza', module: 'mentalita', minutes: 4,
    title: 'Sembrare ricchi o esserlo',
    summary: 'Reddito alto non vuol dire patrimonio alto. Il confronto sociale costa caro.',
    books: ['Thomas J. Stanley e William D. Danko, Il milionario della porta accanto', 'Morgan Housel, La psicologia dei soldi'],
    body: [
      { t: 'p', text: 'Stanley e Danko hanno intervistato migliaia di milionari americani e hanno trovato un dato controintuitivo: molti vivevano in case normali, guidavano auto usate e spendevano molto meno di quanto potessero permettersi. Al contrario, tante persone con redditi alti avevano patrimoni modesti perché spendevano tutto per sembrare ricche.' },
      { t: 'key', text: '**Reddito** è quanto guadagni. **Patrimonio** è quanto ti resta. Solo il secondo ti dà libertà.' },
      { t: 'p', text: 'Il nemico è lo **stile di vita che si gonfia**: ogni aumento di stipendio diventa subito un\'auto più bella, una casa più grande, cene più care. Il risparmio resta fermo anche se guadagni di più.' },
      { t: 'p', text: 'Housel aggiunge un concetto utile: sapere **quando è abbastanza**. Se l\'obiettivo si sposta sempre più in là ogni volta che lo raggiungi, nessuna cifra ti basterà. Avere chiaro cosa ti serve davvero ti protegge dal confronto continuo con gli altri.' },
      { t: 'do', items: ['Al prossimo aumento o entrata extra, decidi in anticipo che almeno metà andrà a risparmio.', 'Prima di un acquisto importante chiediti: lo compro per me o per come mi vedranno gli altri?'] },
    ],
    quiz: [
      { q: 'Cosa hanno scoperto Stanley e Danko su molti milionari?', options: ['Che ostentavano molto', 'Che spendevano meno di quanto potessero permettersi', 'Che avevano tutti ereditato', 'Che avevano redditi altissimi'], correct: 1, explain: 'La frugalità, più del reddito, era il tratto comune.' },
      { q: 'Che differenza c\'è tra reddito e patrimonio?', options: ['Nessuna', 'Il reddito è quanto guadagni, il patrimonio quanto possiedi al netto dei debiti', 'Il patrimonio è il reddito annuo', 'Il reddito include gli investimenti'], correct: 1, explain: 'Puoi avere un reddito alto e un patrimonio vicino a zero, se spendi tutto.' },
      { q: 'Cos\'è lo "stile di vita che si gonfia"?', options: ['Spendere di più man mano che guadagni di più', 'Fare più sport', 'Investire in immobili', 'Risparmiare troppo'], correct: 0, explain: 'Gli aumenti finiscono in spese nuove e il risparmio non cresce.' },
    ],
  },

  /* ---------------- FONDAMENTA ---------------- */
  {
    id: 'conosci-i-numeri', module: 'fondamenta', minutes: 4, apply: 'networth',
    title: 'Conosci i tuoi numeri',
    summary: 'Patrimonio netto e flusso di cassa: le due misure che contano.',
    books: ['Robert Kiyosaki, Padre ricco padre povero', 'Ramit Sethi, I Will Teach You to Be Rich'],
    body: [
      { t: 'p', text: 'Non puoi migliorare quello che non misuri. Due numeri ti dicono quasi tutto sulla tua situazione.' },
      { t: 'p', text: '**Patrimonio netto**: tutto quello che hai (conti, risparmi, investimenti) meno tutto quello che devi (rate, Klarna, prestiti). È la fotografia di oggi.' },
      { t: 'p', text: '**Flusso di cassa**: entrate del mese meno uscite del mese. È il film: ti dice se la fotografia migliorerà o peggiorerà.' },
      { t: 'p', text: 'Kiyosaki distingue tra **attivi**, che ti mettono soldi in tasca, e **passivi**, che te li tolgono ogni mese. Un\'auto comprata a rate è un passivo anche se la consideri "tua". Non tutte le sue tesi reggono a un esame critico, ma questa distinzione è utile: prima di comprare qualcosa chiediti se ti porterà entrate o uscite ricorrenti.' },
      { t: 'key', text: 'L\'abitudine che fa la differenza: guarda questi due numeri **una volta al mese**, sempre lo stesso giorno. Bastano 10 minuti.' },
      { t: 'do', items: ['Imposta i saldi di tutti i conti nell\'app.', 'Segna in calendario un appuntamento fisso mensile con i tuoi numeri.'] },
    ],
    quiz: [
      { q: 'Come si calcola il patrimonio netto?', options: ['Entrate meno uscite', 'Tutto ciò che possiedi meno tutti i debiti', 'Saldo del conto corrente', 'Stipendio annuo'], correct: 1, explain: 'Il patrimonio netto considera tutti i conti e sottrae tutti i debiti.' },
      { q: 'Il flusso di cassa mensile è…', options: ['Il saldo del conto a fine mese', 'Entrate del mese meno uscite del mese', 'Il valore degli investimenti', 'La rata del mutuo'], correct: 1, explain: 'Se è positivo stai risparmiando, se è negativo stai consumando patrimonio.' },
      { q: 'Un\'auto comprata a rate, secondo la distinzione di Kiyosaki, è…', options: ['Un attivo', 'Un passivo', 'Un investimento sicuro', 'Neutra'], correct: 1, explain: 'Rate, assicurazione, bollo e manutenzione tolgono soldi ogni mese.' },
    ],
  },
  {
    id: 'paga-prima-te', module: 'fondamenta', minutes: 4, apply: 'savings',
    title: 'Paga prima te stesso',
    summary: 'La regola più antica della finanza personale, resa automatica.',
    books: ['George S. Clason, L\'uomo più ricco di Babilonia', 'Ramit Sethi, I Will Teach You to Be Rich'],
    body: [
      { t: 'p', text: 'Nel racconto di Clason, il primo consiglio è: di tutto quello che guadagni, una parte deve restare a te. Almeno un decimo, messo da parte **prima** di pagare qualunque altra cosa.' },
      { t: 'p', text: 'La maggior parte delle persone fa il contrario: paga tutto, spende, e risparmia quello che avanza. Ma a fine mese non avanza quasi mai niente.' },
      { t: 'key', text: 'Risparmio = entrate − spese è la formula che non funziona. Quella che funziona è **spese = entrate − risparmio**.' },
      { t: 'p', text: 'Sethi aggiunge la parte pratica: **automatizza**. Imposta un bonifico automatico verso il conto risparmio il giorno dopo l\'accredito dello stipendio. Se i soldi non li vedi sul conto corrente, non li spendi, e non devi ricordarti di farlo né trovare la forza di volontà ogni mese.' },
      { t: 'example', title: 'Con i tuoi conti', text: 'Stipendio su ING, bonifico automatico ricorrente verso il conto di Trade Republic o un conto deposito il giorno dopo. Inizia con il 10%; ogni volta che ricevi un aumento, alza la percentuale.' },
      { t: 'do', items: ['Decidi una percentuale fissa da risparmiare (anche il 5% va bene per iniziare).', 'Imposta il bonifico automatico nell\'app della banca.', 'Aggiungilo qui tra i ricorrenti come entrata sul conto risparmio.'] },
    ],
    quiz: [
      { q: 'Cosa significa "paga prima te stesso"?', options: ['Comprarti qualcosa ogni mese', 'Mettere da parte il risparmio prima di spendere', 'Pagare per primi i debiti', 'Chiedere lo stipendio in anticipo'], correct: 1, explain: 'Il risparmio diventa la prima "spesa" del mese, non quello che avanza.' },
      { q: 'Perché conviene automatizzare il risparmio?', options: ['Perché la banca dà interessi più alti', 'Perché elimina la forza di volontà dall\'equazione', 'Perché è obbligatorio', 'Perché riduce le tasse'], correct: 1, explain: 'Una decisione presa una volta lavora per te ogni mese senza fatica.' },
      { q: 'Nel libro di Clason, quanto conviene trattenere come minimo?', options: ['Un centesimo', 'Un decimo', 'La metà', 'Tutto quello che avanza'], correct: 1, explain: 'Almeno il 10% di ogni entrata.' },
    ],
  },
  {
    id: 'budget', module: 'fondamenta', minutes: 5, apply: 'budget503020',
    title: 'Un budget che non ti fa sentire in gabbia',
    summary: 'La regola 50/30/20 e il piano di spesa consapevole.',
    books: ['Elizabeth Warren e Amelia Warren Tyagi, All Your Worth', 'Ramit Sethi, I Will Teach You to Be Rich', 'Jesse Mecham, You Need a Budget'],
    body: [
      { t: 'p', text: 'Un budget non è una lista di divieti. È decidere **in anticipo** dove vuoi che vadano i tuoi soldi, invece di scoprirlo a fine mese.' },
      { t: 'p', text: '**La regola 50/30/20** (Warren e Tyagi) è il punto di partenza più semplice. Delle entrate nette: il 50% al massimo per le necessità (casa, bollette, spesa, trasporti, salute), il 30% per i desideri (uscite, viaggi, shopping, abbonamenti), il 20% almeno per risparmio e debiti.' },
      { t: 'p', text: '**Il piano di spesa consapevole** di Sethi va oltre: spendi senza sensi di colpa per le cose che ami davvero e taglia senza pietà quelle che non ti interessano. Se adori viaggiare, metti più soldi lì e meno nei vestiti. L\'importante è che il risparmio sia già garantito.' },
      { t: 'p', text: 'Il metodo **YNAB** (You Need a Budget) aggiunge un principio potente: **ogni euro ha un compito**. Quando arriva lo stipendio, assegni ogni euro a una categoria o a un obiettivo, finché non resta niente di "libero".' },
      { t: 'key', text: 'Il budget migliore è quello che rispetti. Parti dai tuoi dati reali degli ultimi mesi, non da cifre ideali.' },
      { t: 'do', items: ['Nella sezione Piano usa "Suggerisci dai miei dati".', 'Riduci del 10% le 2 categorie che ti danno meno soddisfazione.', 'Controlla il budget una volta a settimana per un mese.'] },
    ],
    quiz: [
      { q: 'Nella regola 50/30/20, il 20% va a…', options: ['Necessità', 'Desideri', 'Risparmio e debiti', 'Tasse'], correct: 2, explain: 'È la quota minima da destinare al futuro.' },
      { q: 'Quale di queste è una necessità nella regola 50/30/20?', options: ['Netflix', 'Spesa al supermercato', 'Cena fuori', 'Viaggio'], correct: 1, explain: 'Il cibo di base è una necessità; ristoranti e svago sono desideri.' },
      { q: 'Il principio "ogni euro ha un compito" significa…', options: ['Spendere tutto', 'Assegnare in anticipo ogni euro a una categoria o un obiettivo', 'Investire ogni euro in borsa', 'Tenere tutto in contanti'], correct: 1, explain: 'Nessun euro resta senza destinazione: così le spese non decidono per te.' },
    ],
  },

  /* ---------------- SICUREZZA ---------------- */
  {
    id: 'fondo-emergenza', module: 'sicurezza', minutes: 5, apply: 'emergency',
    title: 'Il fondo emergenza',
    summary: 'Il primo obiettivo di risparmio, prima di qualsiasi investimento.',
    books: ['Dave Ramsey, The Total Money Makeover', 'Morgan Housel, La psicologia dei soldi'],
    body: [
      { t: 'p', text: 'Un\'auto da riparare, un lavoro perso, una spesa medica. Gli imprevisti arrivano sempre, la domanda è solo quando. Il fondo emergenza è una somma messa da parte solo per questi casi, così non devi indebitarti o vendere investimenti nel momento sbagliato.' },
      { t: 'key', text: 'Obiettivo: da **3 a 6 mesi di spese** essenziali. Tre se hai un lavoro stabile e nessuno che dipende da te, sei o più se il reddito è variabile (freelance, contratti a termine).' },
      { t: 'p', text: 'Ramsey suggerisce di partire da un mini-fondo di 1.000 € e poi completarlo. È un traguardo vicino che dà subito tranquillità.' },
      { t: 'p', text: '**Dove tenerlo.** Deve essere disponibile in pochi giorni e senza rischio di perdita: un conto separato da quello delle spese, meglio se remunerato. In Italia tieni conto dei costi: sul conto corrente di una persona fisica si pagano 34,20 € l\'anno di imposta di bollo se la giacenza media supera i 5.000 €; su un conto deposito il bollo è lo 0,20% l\'anno dal primo euro. Gli interessi sono tassati al 26%.' },
      { t: 'p', text: '**Cosa non è un\'emergenza**: le vacanze, i saldi, il nuovo telefono. Per quelli crea obiettivi dedicati.' },
      { t: 'do', items: ['Crea l\'obiettivo "Fondo emergenza" nella sezione Piano.', 'Tienilo su un conto separato e collegalo all\'obiettivo.'] },
    ],
    quiz: [
      { q: 'Quanto dovrebbe coprire un fondo emergenza completo?', options: ['Una settimana di spese', 'Da 3 a 6 mesi di spese', 'Due anni di stipendio', 'Il costo di una vacanza'], correct: 1, explain: 'Di più se il reddito è variabile, di meno se è molto stabile.' },
      { q: 'Dove conviene tenere il fondo emergenza?', options: ['In azioni', 'In crypto', 'Su un conto separato, prelevabile e senza rischio', 'In contanti sotto il materasso'], correct: 2, explain: 'Deve essere sicuro e disponibile in fretta; il rendimento è secondario.' },
      { q: 'Su un conto deposito di 10.000 €, l\'imposta di bollo annua è…', options: ['0 €', '20 €', '34,20 €', '100 €'], correct: 1, explain: 'Lo 0,20% di 10.000 € fa 20 € l\'anno.' },
    ],
  },
  {
    id: 'debiti', module: 'sicurezza', minutes: 5, apply: 'debts',
    title: 'Debiti, rate e "paga in 3"',
    summary: 'Klarna e simili sembrano gratis. Come usarli senza farsi male, e come uscire dai debiti.',
    books: ['Dave Ramsey, The Total Money Makeover', 'Ramit Sethi, I Will Teach You to Be Rich'],
    body: [
      { t: 'p', text: 'I servizi "compra ora, paga dopo" come Klarna spezzano un prezzo in rate piccole, spesso senza interessi se paghi puntuale. Il problema non è la singola rata, ma la somma: tante rate da 30 € sembrano innocue finché non diventano 200 € al mese di uscite fisse.' },
      { t: 'key', text: 'Regola pratica: usa le rate solo per cose che **potresti già pagare per intero oggi**. Se ti servono le rate per permettertelo, non puoi permettertelo.' },
      { t: 'p', text: 'Per qualunque prestito guarda il **TAEG**, non il TAN: include tutte le spese e ti dice il costo reale. Carte revolving e prestiti al consumo possono avere TAEG a due cifre.' },
      { t: 'p', text: '**Come uscire dai debiti.** Due metodi, entrambi validi:' },
      { t: 'p', text: '**Valanga**: paghi il minimo su tutti e metti ogni euro in più sul debito con il tasso più alto. Matematicamente è il più conveniente.' },
      { t: 'p', text: '**Palla di neve** (Ramsey): paghi il minimo su tutti e attacchi il debito più piccolo. Lo chiudi presto, ti motivi, e passi al successivo con la sua rata liberata.' },
      { t: 'example', title: 'Nell\'app', text: 'Registra un acquisto Klarna come uscita sul conto Klarna: il saldo diventa negativo e conta come debito nel patrimonio. Ogni rata pagata da ING è un giroconto da ING a Klarna.' },
      { t: 'do', items: ['Elenca tutte le rate attive con importo e scadenza.', 'Scegli un metodo e stabilisci quanto in più puoi versare ogni mese.'] },
    ],
    quiz: [
      { q: 'Quando ha senso usare le rate senza interessi?', options: ['Sempre, sono gratis', 'Solo per cose che potresti già pagare per intero', 'Per comprare ciò che non puoi permetterti', 'Mai'], correct: 1, explain: 'Così le rate restano uno strumento di comodità e non diventano un debito che si accumula.' },
      { q: 'Quale indicatore mostra il costo totale di un prestito?', options: ['TAN', 'TAEG', 'Spread', 'Euribor'], correct: 1, explain: 'Il TAEG include interessi, spese e commissioni.' },
      { q: 'Il metodo "valanga" chiude per primo…', options: ['Il debito più piccolo', 'Il debito con il tasso più alto', 'Il debito più recente', 'Il debito più vecchio'], correct: 1, explain: 'Attaccare il tasso più alto riduce gli interessi totali pagati.' },
    ],
  },
  {
    id: 'abbonamenti', module: 'sicurezza', minutes: 3, apply: 'subscriptions',
    title: 'Le spese che non vedi',
    summary: 'Abbonamenti e piccole spese ricorrenti, moltiplicati per 12.',
    books: ['Ramit Sethi, I Will Teach You to Be Rich', 'David Bach, The Automatic Millionaire'],
    body: [
      { t: 'p', text: 'Streaming, app, palestra, cloud, piani telefonici: ogni abbonamento da solo costa poco, e proprio per questo non ci pensi più. Ma si rinnovano da soli, ogni mese, anche quando non li usi.' },
      { t: 'p', text: 'David Bach ha reso famoso il "fattore caffè": piccole spese quotidiane che, sommate per anni, valgono cifre importanti. L\'idea va presa con equilibrio: il caffè al bar che ti piace non è il problema. Il problema sono le spese che **non ti danno nulla** e continui a pagare per inerzia.' },
      { t: 'key', text: 'Guarda sempre il **costo annuale**: 12,99 € al mese sono 156 € l\'anno. Chiediti se pagheresti 156 € oggi, in un colpo solo, per quel servizio.' },
      { t: 'p', text: 'Sethi suggerisce anche di **negoziare**: telefono, internet e assicurazioni spesso calano se chiami e chiedi un\'offerta, o se mostri un\'alternativa più economica.' },
      { t: 'do', items: ['Nella sezione Ricorrenti aggiungi tutti i tuoi abbonamenti.', 'Cancella quelli che non hai usato nell\'ultimo mese.', 'Una volta all\'anno controlla le tariffe di telefono e luce.'] },
    ],
    quiz: [
      { q: 'Un abbonamento da 9,99 € al mese costa all\'anno circa…', options: ['10 €', '60 €', '120 €', '240 €'], correct: 2, explain: '9,99 € × 12 = 119,88 €.' },
      { q: 'Il "fattore caffè" insegna che…', options: ['Il caffè va eliminato', 'Le piccole spese ripetute pesano molto nel tempo', 'Conviene comprare caffè all\'ingrosso', 'Il bar è un investimento'], correct: 1, explain: 'La lezione riguarda le spese ripetute senza valore per te, non il caffè in sé.' },
      { q: 'Qual è la domanda giusta per un abbonamento?', options: ['Costa meno di 10 €?', 'Lo pagherei oggi per intero per un anno?', 'Ce l\'hanno i miei amici?', 'Ha una prova gratuita?'], correct: 1, explain: 'Il costo annuale rende evidente il valore reale della spesa.' },
    ],
  },

  /* ---------------- CRESCITA ---------------- */
  {
    id: 'interesse-composto', module: 'crescita', minutes: 4, apply: 'compound',
    title: 'L\'interesse composto',
    summary: 'Perché 100 € al mese da giovane valgono più di 300 € al mese da grande.',
    books: ['Morgan Housel, La psicologia dei soldi', 'John C. Bogle, Il piccolo libro dell\'investimento consapevole'],
    body: [
      { t: 'p', text: 'Con l\'interesse composto i guadagni producono a loro volta altri guadagni. Il primo anno cresci poco, ma col passare del tempo la crescita accelera, perché la base su cui si calcola diventa sempre più grande.' },
      { t: 'example', title: 'Due amici', text: 'Anna investe 150 € al mese dai 21 ai 31 anni e poi si ferma. Marco inizia a 31 e investe 150 € al mese fino ai 65. Con un rendimento ipotetico del 6% annuo, a 65 anni Anna, che ha versato meno di un terzo di Marco, ha quasi quanto lui (circa 188.000 € contro 200.000 €). È il tempo a fare la differenza.' },
      { t: 'key', text: '**La regola del 72**: dividi 72 per il rendimento annuo e ottieni in quanti anni il capitale raddoppia. Al 6%, circa 12 anni. Al 2%, circa 36.' },
      { t: 'p', text: 'Funziona anche al contrario: i **costi** si compongono. Un fondo che costa il 2% l\'anno invece dello 0,2% può mangiarsi una parte enorme del risultato in 30 anni. Bogle ha dedicato la vita a questo messaggio: tieni i costi bassi.' },
      { t: 'p', text: 'I rendimenti degli esempi sono ipotetici: i mercati non salgono in linea retta e ci sono anni negativi. L\'interesse composto premia chi resta investito anche in quegli anni.' },
      { t: 'do', items: ['Prova il simulatore qui sotto con le tue cifre.', 'Annota quanto costa ogni anno ciò in cui investi già (TER, commissioni).'] },
    ],
    quiz: [
      { q: 'Con la regola del 72, al 8% annuo il capitale raddoppia in circa…', options: ['4 anni', '9 anni', '15 anni', '72 anni'], correct: 1, explain: '72 / 8 = 9 anni.' },
      { q: 'Perché iniziare presto conta tanto?', options: ['Perché i rendimenti sono garantiti', 'Perché gli interessi hanno più anni per generare altri interessi', 'Perché le banche premiano i giovani', 'Non conta'], correct: 1, explain: 'La crescita accelera con il tempo: gli ultimi anni sono quelli in cui si guadagna di più.' },
      { q: 'Cosa succede ai costi di un investimento nel lungo periodo?', options: ['Si annullano', 'Si compongono anche loro e riducono molto il risultato', 'Diventano rendimento', 'Vengono rimborsati'], correct: 1, explain: 'Una differenza dell\'1-2% annuo pesa moltissimo in 20-30 anni.' },
    ],
  },
  {
    id: 'inflazione', module: 'crescita', minutes: 4,
    title: 'L\'inflazione e i soldi fermi',
    summary: 'Tenere tutto sul conto corrente sembra sicuro, ma ha un costo invisibile.',
    books: ['JL Collins, La via semplice alla ricchezza', 'Beppe Ghisolfi, Manuale di educazione finanziaria'],
    body: [
      { t: 'p', text: 'L\'inflazione è l\'aumento generale dei prezzi. Se i prezzi salgono del 3% in un anno, con 100 € compri quello che prima costava 97 €. I soldi fermi sul conto non perdono valore nominale, ma **perdono potere d\'acquisto**.' },
      { t: 'key', text: 'Il rendimento che conta è quello **reale**: rendimento al netto di tasse e costi, meno l\'inflazione.' },
      { t: 'p', text: 'Per questo conviene dividere i soldi per orizzonte temporale. Quelli che ti servono a breve, compreso il fondo emergenza, stanno al sicuro: conto remunerato, conto deposito, titoli di Stato a breve scadenza. Lì l\'obiettivo è limitare la perdita di potere d\'acquisto, non guadagnare molto.' },
      { t: 'p', text: 'I soldi che non toccherai per molti anni possono andare in investimenti con rendimento atteso più alto, come gli ETF azionari, che però oscillano. È l\'argomento della prossima lezione.' },
      { t: 'p', text: '**Tasse in Italia, in breve.** Interessi, dividendi e guadagni da ETF e azioni: 26%. Titoli di Stato italiani e di Paesi della white list: 12,5%. Sui conti deposito e sui titoli in deposito c\'è anche il bollo dello 0,20% annuo.' },
      { t: 'do', items: ['Dividi i tuoi soldi in tre gruppi: entro 1 anno, da 1 a 5 anni, oltre 5 anni.', 'Controlla quanto rende oggi il conto dove tieni la liquidità.'] },
    ],
    quiz: [
      { q: 'Se l\'inflazione è al 3% e il conto rende lo 0%, il potere d\'acquisto…', options: ['Resta uguale', 'Cala di circa il 3% l\'anno', 'Cresce del 3%', 'Raddoppia'], correct: 1, explain: 'Con gli stessi euro compri meno cose.' },
      { q: 'Come sono tassati in Italia i guadagni sui titoli di Stato italiani?', options: ['26%', '12,5%', '0%', '43%'], correct: 1, explain: 'I titoli di Stato hanno l\'aliquota agevolata del 12,5%.' },
      { q: 'Cos\'è il rendimento reale?', options: ['Il rendimento lordo', 'Il rendimento al netto di tasse e costi, meno l\'inflazione', 'Il rendimento promesso', 'Il tasso della BCE'], correct: 1, explain: 'È quanto cresce davvero il tuo potere d\'acquisto.' },
    ],
  },
  {
    id: 'etf-pac', module: 'crescita', minutes: 6,
    title: 'ETF e PAC: la via semplice',
    summary: 'Come investono le persone che non vogliono passare la vita a guardare la borsa.',
    books: ['JL Collins, La via semplice alla ricchezza', 'John C. Bogle, Il piccolo libro dell\'investimento consapevole', 'Burton Malkiel, A Random Walk Down Wall Street'],
    body: [
      { t: 'p', text: 'Un **ETF** è un fondo quotato in borsa che replica un indice: comprando una quota possiedi un pezzetto di centinaia o migliaia di aziende insieme. Un ETF sull\'indice mondiale, per esempio, ti fa investire in tutto il mondo con un solo acquisto.' },
      { t: 'p', text: 'Bogle, fondatore di Vanguard, ha mostrato una cosa che l\'industria non ama ripetere: nel lungo periodo la maggior parte dei fondi gestiti attivamente fa peggio del proprio indice, soprattutto per colpa dei costi. Comprare l\'indice intero a costi minimi è una scelta semplice che batte molti professionisti.' },
      { t: 'p', text: 'Il **PAC** (piano di accumulo) è il modo più comune di farlo: investi una cifra fissa ogni mese, automaticamente. Quando i prezzi scendono compri più quote, quando salgono ne compri meno. Soprattutto, elimini il tentativo di indovinare il momento giusto, che quasi nessuno sa fare.' },
      { t: 'key', text: 'La ricetta di Collins in tre parole: **spendi meno di quanto guadagni, investi la differenza in fondi indicizzati a basso costo, evita i debiti.** Poi lascia lavorare il tempo.' },
      { t: 'p', text: '**Cosa guardare in un ETF**: il **TER** (costo annuo, per gli indicizzati spesso sotto lo 0,3%), quanto è diversificato, se è ad **accumulazione** (reinveste i dividendi) o a **distribuzione** (te li paga), e la dimensione del fondo.' },
      { t: 'p', text: 'Investire in azioni significa accettare cali anche del 30-50% in alcuni periodi. Per questo si investono solo soldi che non ti servono per almeno 5-10 anni, dopo aver costruito il fondo emergenza.' },
      { t: 'p', text: 'Questa lezione è educazione finanziaria, non una consulenza: prima di investire informati sul prodotto specifico e, se hai dubbi, parla con un consulente indipendente.' },
      { t: 'do', items: ['Prima: fondo emergenza completo e nessun debito costoso.', 'Scegli una cifra mensile che puoi mantenere anche nei mesi difficili.', 'Decidi in anticipo cosa farai quando il mercato scenderà del 30%: continuare.'] },
    ],
    quiz: [
      { q: 'Cos\'è un ETF?', options: ['Un conto deposito', 'Un fondo quotato che di solito replica un indice', 'Una criptovaluta', 'Un titolo di Stato'], correct: 1, explain: 'Con una quota investi in tutte le aziende dell\'indice.' },
      { q: 'Qual è il vantaggio principale di un PAC?', options: ['Garantisce un rendimento', 'Elimina il tentativo di indovinare il momento giusto', 'Non ha costi', 'Evita le tasse'], correct: 1, explain: 'Investi con regolarità e non dipendi dalle tue previsioni sul mercato.' },
      { q: 'Cosa indica il TER?', options: ['Il rendimento atteso', 'Il costo annuo di gestione del fondo', 'Il rischio', 'Le tasse da pagare'], correct: 1, explain: 'Più è basso, più rendimento resta a te.' },
    ],
  },
  {
    id: 'rischio', module: 'crescita', minutes: 4,
    title: 'Rischio, orizzonte e diversificazione',
    summary: 'Quanto rischiare dipende da quando ti serviranno i soldi.',
    books: ['Burton Malkiel, A Random Walk Down Wall Street', 'Benjamin Graham, L\'investitore intelligente'],
    body: [
      { t: 'p', text: 'Rischio e rendimento vanno insieme: per sperare di guadagnare di più devi accettare oscillazioni più ampie. Le azioni nel lungo periodo hanno reso più delle obbligazioni, ma con cadute molto più profonde lungo la strada.' },
      { t: 'key', text: 'La domanda giusta non è "quanto voglio guadagnare", ma **"quando mi servono questi soldi e quanto calo riesco a sopportare senza vendere?"**' },
      { t: 'p', text: '**Orizzonte**: soldi che servono entro 2-3 anni non vanno in azioni. Su 10-20 anni, invece, le oscillazioni tendono a contare meno.' },
      { t: 'p', text: '**Diversificazione**: non mettere tutto su un\'azienda, un settore o un Paese. Un ETF globale lo fa già per te. Graham ricorda che l\'investitore difensivo deve prima di tutto evitare gli errori gravi, non cercare il colpo grosso.' },
      { t: 'p', text: '**Ribilanciamento**: se hai deciso per esempio 80% azioni e 20% obbligazioni, una volta all\'anno riporti le proporzioni al punto di partenza. Ti costringe a vendere ciò che è salito e comprare ciò che è sceso.' },
      { t: 'do', items: ['Scrivi per ogni obiettivo la data in cui ti serviranno i soldi.', 'Chiediti onestamente come reagiresti vedendo il portafoglio a −30%.'] },
    ],
    quiz: [
      { q: 'Soldi che servono tra 18 mesi per l\'anticipo di un\'auto dovrebbero stare…', options: ['In azioni di una sola azienda', 'In un ETF azionario', 'In strumenti sicuri e liquidi', 'In crypto'], correct: 2, explain: 'Su orizzonti brevi un calo potrebbe non avere il tempo di recuperare.' },
      { q: 'Cosa significa diversificare?', options: ['Comprare molte azioni della stessa azienda', 'Distribuire su molti titoli, settori e Paesi', 'Cambiare spesso investimento', 'Tenere tutto in contanti'], correct: 1, explain: 'Così il crollo di una singola parte pesa poco sul totale.' },
      { q: 'Il ribilanciamento ti porta a…', options: ['Comprare ciò che è salito', 'Vendere ciò che è salito e comprare ciò che è sceso', 'Vendere tutto', 'Non fare nulla'], correct: 1, explain: 'Riporti il portafoglio alle proporzioni decise in partenza.' },
    ],
  },

  /* ---------------- FUTURO ---------------- */
  {
    id: 'pensione-tfr', module: 'futuro', minutes: 6,
    title: 'Fondo pensione e TFR',
    summary: 'Le regole italiane aggiornate al 2026, e perché conviene pensarci a 21 anni.',
    books: ['Normativa: D.Lgs. 252/2005 e Legge di Bilancio 2026 (L. 199/2025)'],
    body: [
      { t: 'p', text: 'La pensione pubblica dei giovani di oggi sarà calcolata con il sistema contributivo e sarà probabilmente più bassa, in proporzione allo stipendio, di quella dei loro genitori. La **previdenza complementare** serve a integrarla.' },
      { t: 'p', text: '**Il TFR** è una parte dello stipendio, circa il 6,9% della retribuzione lorda annua, che il datore di lavoro accantona per te. Puoi lasciarlo in azienda, dove si rivaluta dell\'1,5% fisso più il 75% dell\'inflazione, oppure versarlo in un fondo pensione.' },
      { t: 'p', text: '**Le novità 2026.** La Legge di Bilancio 2026 ha alzato il limite di deducibilità dei versamenti ai fondi pensione da 5.164,57 € a **5.300 €** l\'anno. Dal 1° luglio 2026, inoltre, chi viene assunto per la prima volta è iscritto in automatico al fondo pensione di categoria se entro 60 giorni non esprime una scelta diversa sul TFR.' },
      { t: 'key', text: 'I tre vantaggi del fondo pensione: **deduci** i versamenti dal reddito e paghi meno IRPEF; spesso il **datore di lavoro aggiunge un contributo** se versi anche tu; la **tassazione finale** è agevolata, dal 15% fino al 9% dopo molti anni di iscrizione.' },
      { t: 'p', text: 'I limiti: i soldi sono vincolati fino alla pensione, salvo anticipi previsti per casa, spese mediche e altri casi. Anche qui contano i costi: confronta l\'**ISC** (indicatore sintetico dei costi) dei fondi sul sito della COVIP. I fondi negoziali di categoria hanno di solito costi bassi.' },
      { t: 'do', items: ['Quando inizi un lavoro dipendente, chiedi qual è il fondo di categoria e se c\'è il contributo del datore.', 'Confronta i costi su covip.it prima di scegliere.', 'Le regole fiscali cambiano: verifica sempre i valori dell\'anno in corso.'] },
    ],
    quiz: [
      { q: 'Dal 2026 il limite di deducibilità dei versamenti a un fondo pensione è…', options: ['2.000 €', '5.164,57 €', '5.300 €', 'Nessun limite'], correct: 2, explain: 'La Legge di Bilancio 2026 lo ha portato a 5.300 € l\'anno.' },
      { q: 'Cosa succede dal 1° luglio 2026 ai neoassunti alla prima occupazione che non scelgono?', options: ['Il TFR resta in azienda', 'Vengono iscritti in automatico al fondo di categoria', 'Perdono il TFR', 'Ricevono il TFR in busta paga'], correct: 1, explain: 'C\'è l\'adesione automatica, con 60 giorni per fare una scelta diversa.' },
      { q: 'Dove si confrontano i costi dei fondi pensione?', options: ['Sul sito della COVIP', 'In banca', 'Sui social', 'All\'INPS'], correct: 0, explain: 'La COVIP pubblica l\'ISC di tutti i fondi.' },
    ],
  },
  {
    id: 'indipendenza', module: 'futuro', minutes: 5, apply: 'fi',
    title: 'Indipendenza finanziaria',
    summary: 'Quanto serve per non dipendere più dallo stipendio, e perché il tasso di risparmio decide i tempi.',
    books: ['JL Collins, La via semplice alla ricchezza', 'Vicki Robin e Joe Dominguez, Your Money or Your Life'],
    body: [
      { t: 'p', text: 'Sei finanziariamente indipendente quando i rendimenti del patrimonio coprono le tue spese. Non significa per forza smettere di lavorare: significa poter scegliere.' },
      { t: 'p', text: 'Una stima molto usata viene da studi sul mercato americano, come il cosiddetto Trinity Study: prelevando circa il **4%** del patrimonio il primo anno, e poi adeguando all\'inflazione, un portafoglio diversificato ha storicamente retto per circa 30 anni nella maggior parte dei casi. Da qui la **regola del 25x**: ti serve circa 25 volte la tua spesa annua.' },
      { t: 'example', title: 'Un conto rapido', text: 'Se spendi 18.000 € l\'anno, l\'obiettivo indicativo è 18.000 × 25 = 450.000 €. Se spendi 15.000 €, scende a 375.000 €. Spendere meno abbassa l\'obiettivo e ti fa risparmiare di più: lavora due volte.' },
      { t: 'key', text: 'Il fattore che decide **quando** ci arrivi non è il reddito ma il **tasso di risparmio**: con il 10% servono decenni, con il 50% molto meno.' },
      { t: 'p', text: 'Prendi la regola come una bussola, non come una promessa: è basata su dati storici, su orizzonti di circa 30 anni, e non considera tasse e costi italiani. Per piani lunghi molti usano una percentuale più prudente, per esempio il 3-3,5%.' },
      { t: 'do', items: ['Guarda qui sotto la stima basata sul tuo tasso di risparmio.', 'Prova a vedere come cambia aumentando il risparmio del 5%.'] },
    ],
    quiz: [
      { q: 'Con la regola del 25x, se spendi 20.000 € l\'anno ti serve circa…', options: ['200.000 €', '500.000 €', '1.000.000 €', '80.000 €'], correct: 1, explain: '20.000 € × 25 = 500.000 €.' },
      { q: 'Cosa decide di più i tempi per l\'indipendenza finanziaria?', options: ['Il reddito lordo', 'Il tasso di risparmio', 'La banca scelta', 'L\'età'], correct: 1, explain: 'Riduce le spese da coprire e aumenta i soldi investiti.' },
      { q: 'La regola del 4% va considerata…', options: ['Una garanzia', 'Una stima storica da usare con prudenza', 'Una legge', 'Valida solo in Italia'], correct: 1, explain: 'Nasce da dati del passato sul mercato USA e non tiene conto di tasse e costi locali.' },
    ],
  },

  /* ---------------- TRAPPOLE ---------------- */
  {
    id: 'trappole', module: 'trappole', minutes: 5,
    title: 'Gli errori che costano di più',
    summary: 'Promesse troppo belle, FOMO, trading e acquisti d\'impulso.',
    books: ['Benjamin Graham, L\'investitore intelligente', 'Morgan Housel, La psicologia dei soldi', 'Daniel Kahneman, Pensieri lenti e veloci'],
    body: [
      { t: 'p', text: '**Promesse di rendimenti alti e sicuri.** Non esistono. Se qualcuno ti garantisce il 2% al mese, ti fa fretta o ti chiede di portare amici, sono i segnali tipici di truffe e schemi piramidali. Verifica sempre che chi ti propone un investimento sia autorizzato: in Italia lo controlli sul sito della CONSOB.' },
      { t: 'p', text: '**FOMO, la paura di restare fuori.** Quando un investimento è sulla bocca di tutti e sui social, di solito è già salito molto. Comprare per paura di perdere l\'occasione è il modo più comune di comprare in alto e vendere in basso.' },
      { t: 'p', text: '**Il trading frequente.** Graham distingue l\'investitore dallo speculatore. La maggior parte di chi fa trading su azioni, crypto o CFD perde soldi: le stesse piattaforme sono obbligate a dichiarare quanti clienti perdono sui CFD, e sono la maggioranza. Se vuoi speculare, usa solo una piccola parte che puoi permetterti di perdere.' },
      { t: 'p', text: '**Le scelte emotive.** Kahneman mostra che una perdita ci fa soffrire circa il doppio di quanto ci renda felici un guadagno equivalente. Per questo si vende nel panico. La difesa è avere un piano scritto prima, quando sei calmo.' },
      { t: 'key', text: 'Regola delle **72 ore**: per ogni acquisto non pianificato sopra una certa cifra, per esempio 100 €, aspetta 3 giorni. Se lo vuoi ancora, compralo.' },
      { t: 'do', items: ['Scegli la tua soglia per la regola delle 72 ore.', 'Prima di ogni investimento chiediti: capisco come guadagna? Chi ci guadagna se compro?'] },
    ],
    quiz: [
      { q: 'Qualcuno ti promette il 3% al mese garantito. È…', options: ['Un\'ottima occasione', 'Un forte segnale di truffa', 'Normale per gli ETF', 'Un conto deposito'], correct: 1, explain: 'Nessun investimento legittimo garantisce rendimenti così alti.' },
      { q: 'Dove verifichi se un intermediario è autorizzato in Italia?', options: ['Su Instagram', 'Sul sito della CONSOB', 'Chiedendo a lui', 'Su un forum'], correct: 1, explain: 'La CONSOB pubblica gli elenchi degli autorizzati e gli avvisi sulle realtà abusive.' },
      { q: 'A cosa serve la regola delle 72 ore?', options: ['A ottenere sconti', 'A evitare acquisti d\'impulso', 'A pagare in rate', 'A risparmiare tasse'], correct: 1, explain: 'Il tempo fa sbollire il desiderio del momento.' },
    ],
  },
]

export const lessonById = (id: string) => LESSONS.find((l) => l.id === id)
