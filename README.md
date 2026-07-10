# Persistent Civilization Simulator

Una simulazione emergente di un mondo vivente, interamente in un singolo file HTML (nessun server, nessuna dipendenza). Il giocatore è un osservatore — un "Viandante Eterno" — in un mondo che nasce, evolve e continua a vivere anche quando la pagina è chiusa.

**▶ Per giocare:** apri `dist/PersistentCivilizationSimulator.html` in un browser moderno (oppure `index.html` per la versione di sviluppo a moduli separati).

## Caratteristiche

- **Mondo procedurale**: continenti, montagne, fiumi, foreste, deserti, biomi, clima e stagioni generati dal seed. Mappa esplorabile con zoom, trascinamento e minimappa.
- **Individui unici**: ogni abitante simulato ha nome (in una lingua procedurale della sua cultura), età, personalità, valori, salute, professione, ricchezza, religione, famiglia, amici, nemici, ricordi, obiettivi ed emozioni. Nasce, studia, lavora, si innamora, litiga, ha figli, si ammala, invecchia e muore — e ogni morte lascia conseguenze (lutti, orfani, eredità, vendette).
- **Memoria**: i ricordi ("mio padre è morto in guerra", "quel regno ci ha conquistati") modificano il comportamento futuro e le conversazioni.
- **Genealogia**: alberi familiari su più generazioni, consultabili per secoli.
- **Culture**: lingua, cibo, architettura, vestiti, musica, feste, simboli, bandiera, mitologia, tradizioni e valori diversi per ogni civiltà.
- **Tecnologia**: dal fuoco al volo spaziale, con percorsi diversi a ogni partita (affinità di ricerca casuali per civiltà).
- **Politica**: tribù, monarchie, imperi, repubbliche, dittature, federazioni, teocrazie, oligarchie; successioni, elezioni, colpi di stato, rivoluzioni, secessioni.
- **Economia**: risorse limitate, capacità portante del territorio, mercati con prezzi e inflazione, rotte commerciali, pirati, carestie, crisi.
- **Guerra e diplomazia**: guerre nate da cause concrete (confini, religione, vendetta, tributi, secessioni), battaglie con morti, orfani, profughi, eroi, criminali e nuovi confini; alleanze, tradimenti, trattati, tributi, unioni.
- **Natura**: fauna con catena alimentare (prede/predatori, migrazioni, estinzioni), epidemie, incendi, terremoti, eruzioni, meteoriti.
- **Religione**: fedi con profeti, testi sacri, riti, feste e miti; scismi, conversioni, estinzioni. Il giocatore stesso può diventare oggetto di culto.
- **Cronologia**: ogni evento è registrato in una timeline consultabile per decennio, con filtri e ricerca. I grandi eventi ricevono nomi epici.
- **Conversazioni con gli NPC**: clicca una città → un abitante → "Parla". Ogni risposta è costruita dallo stato reale del personaggio (età, cultura, fede, professione, emozioni, ricordi, eventi storici realmente accaduti). Gli NPC ricordano ogni conversazione anche dopo decenni, reagiscono a insulti, aiuti e promesse, mentono, spettegolano e sanno solo ciò che potrebbero realisticamente sapere. I figli possono aver sentito parlare di te dai genitori.
- **Persistenza**: salvataggio automatico compresso in `localStorage`; alla riapertura il mondo recupera il tempo trascorso offline.
- **Velocità**: pausa, 1×, 2×, 5×, 10×, 50×, 100×, 1000× (tasti 1–8, spazio per pausa).

## Struttura del codice

```
index.html            versione di sviluppo (carica i moduli separati)
build.js              genera dist/PersistentCivilizationSimulator.html (file unico)
src/
  core/               utilità, RNG deterministico, noise, lingue procedurali, compressione LZ
  sim/                worldgen, culture, persone, tecnologia, civiltà, motore, demografia,
                      politica, economia, guerra/diplomazia, natura, cronaca storica
  chat/               motore di conversazione degli NPC
  render/             renderer canvas (mappa, overlay politico, minimappa)
  ui/                 pannelli, ispettori, timeline, ricerca, grafici, finestra di chat
test/                 test headless (Node), simulazioni di lungo periodo
```

## Sviluppo

```bash
node test/sim.test.js    # test del motore (genesi, 300 anni, save/load, chat)
node test/longrun.js     # simulazione di 1200 anni con statistiche
node build.js            # ricostruisce l'artifact single-file in dist/
```

Il salvataggio è versionato (`v: 1`): le estensioni future devono aggiungere campi opzionali senza rimuovere quelli esistenti, per non rompere i mondi salvati.
