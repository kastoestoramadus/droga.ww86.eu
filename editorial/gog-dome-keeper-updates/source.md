# Dome Keeper, GOG i zaległe aktualizacje — baza merytoryczna

Publiczna baza źródłowa tej publikacji, stan na 2026-10-25. Materiał redakcyjny poza kolekcjami Astro,
nie drugi artykuł. Najpierw aktualizuj tę bazę, potem obie wersje publikacyjne. Wspólny klucz
tłumaczeń: `gog-dome-keeper-updates`. Linki do plików publikacyjnych dopisze wariant artykułu.

## Fakty autora (potwierdzone przez autora, nie zmyślone)

- Cenię gry bez DRM i samą ideę GOG; wspierałem ten sklep i próbowałem w nim kupować.
- Lokalna kooperacja (kanapowa, na podzielonym ekranie) jest dla mnie szczególnie ważna — bardzo
  chciałem zagrać w Dome Keepera właśnie tak.
- W moim wydaniu z GOG lokalnej kooperacji wciąż nie ma (stan: październik 2026).
- Moja cierpliwość się skończyła i uważam tę sytuację za niedopuszczalną — a jednocześnie naprawdę
  życzę GOG i takim inicjatywom dobrze. Obie te rzeczy są prawdziwe naraz; żadnej nie chowamy.

Czego w tej bazie nie ma, bo tego nie było: liczby ani dat zakupów, rodzinnych sesji, korespondencji
z pomocą techniczną, bojkotu ani decyzji o odejściu od sklepu.

## Najważniejsze ustalenie i jego dowody

Darmowa aktualizacja Dome Keepera z multiplayerem — w tym lokalny split-screen — wyszła 13 kwietnia
2026 na Steam i Xbox. W dniu obserwacji (25 października 2026) najnowsza publiczna wersja na GOG to
nadal 4.2.3, opublikowana 8 kwietnia 2025, a karta produktu w GOG nie wymienia żadnej kooperacji.
Różnica: 195 dni od premiery aktualizacji do dnia obserwacji (13.04.2026 → 25.10.2026).

| Twierdzenie | Dowód | Rodzaj dowodu | Data pobrania |
|---|---|---|---|
| Aktualizacja z „cooperative play, competitive play, local splitscreen and online multiplayer" uruchomiona 13.04.2026 (Steam, Xbox; darmowa) | [ogłoszenie Raw Fury](https://rawfury.com/dome-keeper-the-lost-keepers-dlc-out-now/) | oficjalne ogłoszenie wydawcy | 2026-10-25 |
| Steam: kategorie „Shared/Split Screen Co-op", „Online Co-op", „Cross-Platform Multiplayer" | [API sklepu Steam](https://store.steampowered.com/api/appdetails?appids=1637320&filters=categories) | oficjalne metadane | 2026-10-25 |
| Steam: aktualna wersja v5.0.8 (poprawka z 3.09.2026) | [Steam news API](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1637320&count=40) | oficjalne ogłoszenia | 2026-10-25 |
| GOG: najnowsza publiczna wersja Windows to 4.2.3, `date_published` 2025-04-08 | [publiczne API buildów GOG](https://content-system.gog.com/products/1635627436/os/windows/builds?generation=2) | bezpośrednia obserwacja | 2026-10-25 |
| GOG: instalator offline też 4.2.3 (856,7 MB); tylko Windows | [GOGDB](https://www.gogdb.org/product/1635627436) | niezależny tracker (zgodny z API) | 2026-10-25 |
| Karta GOG wymienia tylko Single-player (spośród trybów gry) | [karta produktu GOG](https://www.gog.com/en/game/dome_keeper) | bezpośrednia obserwacja | 2026-10-25 |
| Społecznościowa lista „2nd Class" potwierdza: Steam 5.0 od 13.04.2026, GOG 4.2.3, brak multiplayera i DLC | [arkusz v3](https://docs.google.com/spreadsheets/d/14haGnU2kcY6wV6ssBeyW6_mMk6kkVqZX-QvMKlgXGu0/edit) (aktualizacja 2026-10-24) | zbiór społecznościowy | 2026-10-25 |

Zastrzeżenia do dowodów: znacznik czasu publikacji builda w API GOG to niekoniecznie moment, w którym
klient może go pobrać; GOGDB jest trackerem strony trzeciej i może się spóźniać — dlatego liczy się
zgodność czterech niezależnych dróg (API, tracker, karta sklepu, lista społeczności). Brak wpisu
„kooperacja" na karcie GOG sam w sobie niczego nie dowodzi o przyszłych buildach — dowodzi go to, że
najnowszy publiczny build (4.2.3) jest starszy niż aktualizacja.

## Chronologia (skrót; pełna w `data/timeline.csv`)

- 27.09.2022 — premiera Dome Keepera (Steam i GOG).
- 25.11.2022 — GOG ogranicza systemy do Windows (były też Mac i Linux; tracker GOGDB).
- 07.03.2023 — aktualizacja 2.4 na Steam; na GOG nie ma jej przez tygodnie; 18.03.2023 otwierany
  jest wątek na forum GOG, a 2.04.2023 deweloper Bippinbits tłumaczy: „again and again (…) there are
  new crashes specific to GOG", wrapper „supplied by GOG, but still in beta"; zapowiada, że takie
  poślizgi „probably (…) be common in the future too".
- 27.09.2024 — ogłoszenie: milion graczy; multiplayer i modding „to come".
- 13/14.11.2024 — GOG Preservation Program; zespół GOG przyznaje: „we could have done a much better
  job maintaining the games released on GOG in the past" (o klasykach, nie o nowych grach).
- 08.04.2025 — build 4.2.3: ostatnia publiczna wersja w GOG (do dnia obserwacji).
- 20/21.08.2025 — zapowiedź multiplayera (online i lokalny) z zwiastunem.
- 29.12.2025 — CD PROJEKT ogłasza sprzedaż 100% udziałów GOG współzałożycielowi Michałowi Kicińskiemu
  za 90,7 mln zł; GOG pisze, że zostaje stabilne („Is GOG financially unstable? No." — oświadczenie
  o sobie, nie audyt).
- 10.02.2026 — publiczny playtest multiplayera na Steam (tydzień).
- 09.03.2026 — data premiery ogłoszona tylko dla „Steam & XBOX".
- 13.04.2026 — premiera darmowej aktualizacji (kooperacja, w tym lokalny split-screen) i płatnego
  DLC The Lost Keepers (7,99 €). GOG w ogłoszeniach nie pada.
- 03.09.2026 — Steam ma już v5.0.8.
- 25.10.2026 — obserwacja: GOG nadal 4.2.3; karta nadal tylko Single-player; 195 dni różnicy.

## Szerszy kontekst: lista „Games that treat GOG customers as 2nd Class v3"

Stan arkusza: aktualizacja 24.10.2026. **1172 gry, 1573 problemy** — i to drugie nie znaczy „gier bez
aktualizacji": jedna gra może mieć kilka problemów, a kategoria „Missing Updates" liczy **325**
przypadków. Pozostałe kategorie to m.in. Missing Soundtrack (446), Missing Builds (280), Missing Paid
DLC (212), Missing Features (113), Missing Languages (100), Missing Free DLC (51), Region Locking (12),
Other (34) — suma controlna 1573 zgadza się z komórką „Current total issues". Przypisujemy dokładnie
te liczby i te nazwy kategorii; nie nazywamy 1573 problemów „liczbą zaniedbanych gier".

Granice tej listy: to zbiór prowadzony przez społeczność (provenance zweryfikowane 25.10.2026
z otwierającego posta wątku „Games that treat GOG customers as second class citizens v2" na forum GOG:
lista prowadzona od 2018 r. przez użytkownika omega64, zapożyczona od fronzelneekburma; wpisy trafiają
na zgłoszenia graczy, jedyna reguła dowodowa to prośba o datę najwcześniejszego brakującego patcha),
17 „Special Mentions" jest w samym arkuszu oznaczonych jako niepotwierdzone, a próbkowanie jest
samoselekcyjne — gracze zgłaszają to, co ich zaboli. Lista mówi, że problem wygląda
systemowo; nie mówi, jak wygląda cała oferta sklepu.

## Porównanie przypadków (pełne dane w `data/comparison-cases.csv`)

Cztery zbadane przypadki pokazują, że „brakująca aktualizacja" to nie jeden rodzaj problemu:
- **Pathfinder: Kingmaker EE** (zamrożenie świadome, potwierdzone przez dewelopera): build Linux
  stoi na 2.1.5d, bo „the development for Pathfinder: Kingmaker is no longer active, and we're not
  able to produce or upload new builds for any platform" (post z tagiem dewelopera, 19.11.2025) —
  przyczyna leży po stronie końca prac dewelopera, nie decyzji sklepu.
- **Death From Above – Complete Edition** (mały tytuł; GOG na 1.0.1, naprawa achievementu
  „Warship" wyszła na Steam w 1.0.2 — wg wątku z lutego 2024): gracze zgłaszają brak odpowiedzi
  GOG, Rockodile i Lesser Evil (wątek z 10.12.2025).
- **Skyrim Special Edition** (duży wydawca): memory leak opisany jako specyficzny dla wersji GOG
  (OP 31.08.2024: „This doesn't happen with the Steam version"), wątek żyje do sierpnia 2026,
  bez odpowiedzi zespołu GOG ani Bethesdy.
- **Batman: Arkham Knight** (przypadek „prawie kompletu"): wg listy wszystkie aktualizacje
  dotarły poza jedną z 3.12.2020 (skiny) — lista notuje i wieloletnie zamrożenia, i pojedyncze
  drobne braki; nie każdemu wierszowi przysługuje ta sama waga.

Wniosek dla publikacji: zanim ktoś nazwie przypadek „porzuceniem", trzeba sprawdzić, czy to
poślizg (Dome Keeper 2023), świadome zamrożenie (Kingmaker), śmierć projektu, czy drobny brak
(Batman) — a bez odpowiedzi oficjalnej strony przyczyna pozostaje nieznana.

## Kto za to odpowiada — rozdzielone pytania

1. **Strona dewelopera/wydawcy** (Bippinbits/Raw Fury): w 2023 r. deweloper publicznie wskazał
   techniczne przyczyny poślizgów specyficzne dla GOG (crashe tylko na GOG; wrapper dostarczany przez
   GOG w betacie). Na temat poślizgu 2026 nie znaleziono w tych poszukiwaniach żadnego oficjalnego,
   dated statement (szukano: ogłoszenia Raw Fury, Steam news, forum GOG, przeszukiwanie sieci;
   25.10.2026).
2. **Strona sklepu (GOG)**: jakość narzędzi dla deweloperów (ten wrapper), komunikacja i polityka
   parity. Preservation Program (2024) dotyczy klasyków i utrzymywania kompatybilności, nie pełnej
   aktualności całego katalogu; zespół GOG sam przyznał, że dawniej utrzymanie mogło być lepsze.
3. **Własność**: GOG zmieniło właściciela (29.12.2025, Kiciński/CD PROJEKT, źródła pierwotne).
   Zbieżność czasowa z premierą aktualizacji (kwiecień 2026) nie jest dowodem przyczyny — poślizgi
   z 2023 r. pokazują, że problem jest starszy niż zmiana właściciela.

## Hipotezy wykluczone z tekstu publikacji (do tego brak dowodów)

- „GOG bankrutuje / ciąło zasoby nowego właściciela" — brak dowodów; jedyne oświadczenie finansowe
  to self-statement GOG z 29.12.2025 („stable"). To nadal hipoteza do sprawdzenia, nie ustalenie.
- „Deweloper porzucił GOG" — bez dowodów; w 2023 r. tłumaczył się technicznie i patch w końcu wyszedł
  (4.2.3 jest na GOG). Recenzja z 6.05.2026 (właściciel gry na GOG) powołuje się na obietnicę
  deweloperów na Discordzie — to lead drugiej ręki, nie oświadczenie.
- „To wina DRM-free" — nic nie wskazuje, że brak DRM powoduje poślizgi; instalator offline działa
  i to jest wartość GOG, którą autor szanuje.
- „GOG obiecało pełną parity katalogu i złamało słowo" — taki promise nie został znaleziony;
  Preservation Program dotyczy klasyków.

## Nierozstrzygnięte i dalsze pytania (odkładamy, nie domykamy)

- Czy i kiedy kooperacja trafi do GOG — nieznane (na 25.10.2026).
- Czy poślizg 2026 ma tę samą przyczynę techniczną co 2023 — nieznane; nie przepisujemy wyjaśnienia
  z 2023 r. na 2026 r.
- Ile gier z listy 325 „Missing Updates" to krótkie poślizgi, a ile wieloletnie zamrożenia —
  arkusz tego nie rozróżnia wprost; wymagałoby osobnej analizy próbkowania.
- Mac/Linux na GOG zniknęły z karty w 2022 r. — przyczyna nieznana (tracker odnotowuje fakt).

## Skąd te liczby i cytaty

Wszystkie daty pobrania: 2026-10-25. Źródła są podlinkowane w tabeli powyżej, a pełne provenance
wierszy (URL, data, rodzaj dowodu, pewność) leżą w `data/timeline.csv` i `data/feature-comparison.csv`
obok tej bazy. Cytaty po angielsku przytaczamy w oryginale, w tłumaczeniu podajemy je w tekście
publikacji z adnotacją „tłumaczenie własne". Dzień obserwacji (25.10.2026)
jest w każdej wizualizacji widoczny dla czytelnika jako punkt odniesienia; wszelkie „dni poślizgu"
liczymy wyłącznie od 13.04.2026 do tego dnia i nigdy inaczej.
