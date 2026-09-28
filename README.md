# Müzik Listesi Aktarıcı

Çalma listelerinizi ve beğendiğiniz şarkıları **Spotify**, **YouTube Music**, **Apple Music** ve **Deezer** arasında aktaran bir web uygulaması. Next.js (App Router), TypeScript ve Tailwind CSS ile yazıldı.

- Kaynak platformdaki listeler ve "Beğenilen şarkılar" listelenir. Aktarmak istediklerinizi seçersiniz.
- Her şarkı hedefte önce **ISRC** koduyla aranır. ISRC yoksa **sanatçı + şarkı adı** ile aranır (başlıklar normalize edilir).
- Sonuçlar süre (±3 sn), sanatçı ve başlık benzerliğine (Levenshtein) göre puanlanır.
- Eşleşme ekranında şarkılar üç grupta gösterilir: **Bulunanlar**, **Emin olunamayanlar** (adaylardan birini seçersiniz) ve **Bulunamayanlar**.
- Listeler hedefte aynı adla oluşturulur. Beğenilen şarkılar hedefte de beğenilenlere eklenir.
- Sonda bir rapor gösterilir. Bulunamayan şarkıları **CSV** olarak indirebilirsiniz.
- Aktarım yarıda kalırsa (sekme kapandı, kota doldu, oturum düştü) **kaldığı yerden devam eder**.
- **Dosyadan içe aktarma** desteklenir: Exportify ve TuneMyMusic CSV, düz metin (`Sanatçı - Şarkı`) ve Spotify veri indirme JSON'u. Bu yolla kaynak platforma giriş yapmanız gerekmez.
- Arayüz Türkçedir, mobil uyumludur ve açık/koyu temayı destekler.

> ⚠️ **Başlamadan önce okuyun: platform kısıtları**
>
> - **Apple Music**, ücretli bir **Apple Developer Program** üyeliği (yıllık 99 USD) gerektirir. Ücretsiz Apple hesabıyla MusicKit anahtarı oluşturulamaz.
> - **YouTube Data API**'nin **günlük kotası** vardır: varsayılan 10.000 birim. Tek bir şarkı araması 100 birim, listeye şarkı eklemek 50 birim tutar. Bu yüzden YouTube'a günde yaklaşık **60–65 şarkı** aktarılabilir. Kota dolunca aktarım duraklar ve ertesi gün kaldığı yerden devam edebilirsiniz.
> - **Spotify** uygulamaları "Development Mode"da açılır. Bu modda uygulamayı **yalnızca Dashboard'a elle eklediğiniz, sınırlı sayıda kullanıcı** (yeni uygulamalar için 5 kişi) kullanabilir. Uygulama sahibinin **Spotify Premium** aboneliği olmalıdır. Ayrıca geliştirici modunda yalnızca **size ait (veya ortak) listelerin** şarkıları okunabilir. Herkese açık kullanım için "Extended Quota" başvurusu gerekir ve Spotify bunu yalnızca kurumsal başvurulara veriyor.
> - **Deezer** şu an **yeni geliştirici uygulaması kaydı almıyor**. Portal "We're not accepting new application creation at this time" mesajı gösteriyor. Elinizde daha önce oluşturulmuş bir Deezer uygulaması varsa kullanabilirsiniz. Yoksa Deezer seçeneği "Kullanılamıyor" görünür. Deezer listelerinizi yine de TuneMyMusic gibi bir araçla CSV'ye aktarıp **dosyadan içe aktarma** ile taşıyabilirsiniz.

---

## İçindekiler

1. [Hızlı başlangıç](#hızlı-başlangıç)
2. [Ortam değişkenleri](#ortam-değişkenleri)
3. [Platform kurulumları](#platform-kurulumları)
   - [Spotify](#spotify)
   - [YouTube / YouTube Music](#youtube--youtube-music)
   - [Apple Music](#apple-music)
   - [Deezer](#deezer)
4. [Dosyadan içe aktarma](#dosyadan-içe-aktarma)
5. [Vercel'e yayınlama](#vercele-yayınlama)
6. [Mimari](#mimari)
7. [Güvenlik](#güvenlik)
8. [Sık karşılaşılan sorunlar](#sık-karşılaşılan-sorunlar)

---

## Hızlı başlangıç

Gereksinim: **Node.js 20.9 veya üstü**.

```bash
npm install
cp .env.example .env.local      # değerleri doldurun (aşağıya bakın)
openssl rand -base64 32         # SESSION_SECRET için rastgele değer üretir
npm run dev                     # http://127.0.0.1:3000
```

> Uygulamayı **`http://127.0.0.1:3000`** adresinden açın, `localhost` kullanmayın. Spotify artık redirect URI'lerde `localhost` kabul etmiyor. Çerezlerin doğru çalışması için tarayıcıdaki adres ile `APP_URL` aynı olmalı.

Diğer komutlar:

| Komut | Açıklama |
| --- | --- |
| `npm run build` | Üretim derlemesi |
| `npm start` | Derlenmiş uygulamayı çalıştırır |
| `npm test` | Eşleştirme ve dosya içe aktarma testleri (Vitest) |
| `npm run typecheck` | TypeScript kontrolü |

Tüm platformların anahtarlarını girmeniz gerekmez. Anahtarı tanımlı olmayan platform arayüzde "Kullanılamıyor" olarak görünür. Örneğin yalnızca Spotify anahtarlarıyla, dosyadan Spotify'a aktarım yapabilirsiniz.

---

## Ortam değişkenleri

Tümü `.env.example` dosyasında açıklamalarıyla birlikte duruyor. Hiçbiri `NEXT_PUBLIC_` önekli değildir; yani **hiçbiri tarayıcıya gönderilmez**.

| Değişken | Zorunlu | Açıklama |
| --- | --- | --- |
| `APP_URL` | Evet | Uygulamanın tam adresi. Yerelde `http://127.0.0.1:3000`, Vercel'de `https://uygulamaniz.vercel.app`. Tüm redirect URI'ler bundan türetilir. |
| `SESSION_SECRET` | Evet | Çerezleri şifrelemek için en az 32 karakterlik rastgele değer. |
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | Spotify için | Spotify Developer Dashboard'dan alınır. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | YouTube için | Google Cloud Console'dan alınır. |
| `DEEZER_APP_ID`, `DEEZER_APP_SECRET` | Deezer için | Deezer geliştirici portalından alınır. |
| `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` | Apple için | Apple Developer hesabından alınır. |
| `APPLE_DEFAULT_STOREFRONT` | Hayır | Varsayılan Apple Music mağazası (ör. `tr`). Kullanıcının kendi mağazası girişte otomatik alınır. |

Her platformun redirect URI biçimi şudur:

```
{APP_URL}/api/auth/{platform}/callback
```

Örnek: `http://127.0.0.1:3000/api/auth/spotify/callback`

---

## Platform kurulumları

### Spotify

1. **Hesap:** <https://developer.spotify.com> adresine Spotify hesabınızla giriş yapın ve geliştirici koşullarını kabul edin. Development Mode'daki uygulamalar için uygulama sahibinin **Spotify Premium** aboneliği olması gerekir.
2. **Uygulama oluşturma:** <https://developer.spotify.com/dashboard> sayfasında **Create app**'e tıklayın.
   - **App name / App description:** istediğiniz ad ve açıklama.
   - **Redirect URIs:** aşağıdakileri ekleyin (her birini yazıp **Add**'e basın):
     - `http://127.0.0.1:3000/api/auth/spotify/callback`
     - Yayındaki adresiniz, ör. `https://uygulamaniz.vercel.app/api/auth/spotify/callback`
   - **Which API/SDKs are you planning to use?** sorusunda **Web API**'yi işaretleyin.
   - Kullanım koşullarını onaylayıp **Save**'e basın.
3. **Anahtarlar:** Uygulamanın **Settings** sayfasında **Client ID**'yi kopyalayın. **View client secret**'a tıklayıp **Client secret**'ı da kopyalayın. Bunları `.env.local` dosyasındaki `SPOTIFY_CLIENT_ID` ve `SPOTIFY_CLIENT_SECRET` alanlarına yazın.
4. **Kullanıcı ekleme (önemli):** **Settings → User Management** bölümünde uygulamayı kullanacak herkesi (siz dahil) **ad ve Spotify hesabının e-posta adresiyle** ekleyin. Listede olmayan kullanıcılar giriş yapabilir ama API istekleri `403` döner.

**Spotify'a özgü notlar**

- **Kullanıcı sınırı:** Development Mode'da uygulamayı yalnızca User Management'a eklenen kişiler kullanabilir. Yeni uygulamalarda bu sınır **5 kullanıcıdır**. Daha geniş kullanım için Dashboard'dan **Extended Quota Mode** başvurusu gerekir ve Spotify bunu şu an yalnızca kurumsal başvurulara onaylıyor.
- **Başkasına ait listeler:** Development Mode'da yalnızca **size ait (veya ortak çalıştığınız) listelerin** şarkıları okunabilir. Takip ettiğiniz başkasına ait listeler seçim ekranında uyarıyla gösterilir ve okunamazsa atlanır. Böyle bir listeyi taşımak için Spotify'da kopyasını oluşturun ya da Exportify ile CSV'ye aktarın.
- **ISRC:** Development Mode'da Spotify şarkı nesnelerinde ISRC bilgisi dönmeyebilir. Bu durumda uygulama otomatik olarak sanatçı + başlık aramasına geçer.
- **Güncel uç noktalar:** Uygulama, Spotify'ın Şubat 2026 değişikliklerine göre yazıldı: `/playlists/{id}/items`, `POST /me/playlists`, `PUT /me/library` ve arama başına en fazla 10 sonuç.

### YouTube / YouTube Music

YouTube Music'in herkese açık resmi bir API'si yoktur. Bu yüzden uygulama **YouTube Data API v3** kullanır. YouTube Music kitaplığınız YouTube hesabınızla aynı çalma listelerini ve beğenileri paylaştığı için aktarılan listeler YouTube Music'te de görünür.

1. **Proje:** <https://console.cloud.google.com> adresinde üstteki proje seçiciden **New Project** ile yeni bir proje oluşturun.
2. **API'yi etkinleştirme:** **APIs & Services → Library** sayfasında **YouTube Data API v3**'ü bulun ve **Enable**'a basın.
3. **OAuth izin ekranı:** **Google Auth Platform** (ya da **APIs & Services → OAuth consent screen**) sayfasını açın.
   - **Branding:** uygulama adını ve destek e-postasını girin.
   - **Audience:** User type olarak **External** seçin. Yayın durumu **Testing** kalırken **Test users** bölümüne kendi Google hesabınızı ve uygulamayı kullanacak diğer hesapları ekleyin (en fazla 100 kişi).
   - **Data Access:** `https://www.googleapis.com/auth/youtube` kapsamını ekleyin.
4. **OAuth istemcisi:** **Clients** (ya da **Credentials → Create credentials → OAuth client ID**) sayfasında yeni istemci oluşturun.
   - **Application type:** **Web application**
   - **Authorized redirect URIs:**
     - `http://127.0.0.1:3000/api/auth/youtube/callback`
     - `https://uygulamaniz.vercel.app/api/auth/youtube/callback`
5. **Anahtarlar:** Oluşan **Client ID** ve **Client secret** değerlerini `GOOGLE_CLIENT_ID` ve `GOOGLE_CLIENT_SECRET` alanlarına yazın.
6. **YouTube kanalı:** Giriş yapılan Google hesabının bir YouTube kanalı olmalıdır. Yoksa YouTube'da bir kez kanal oluşturun.

**YouTube kotası (önemli)**

| İşlem | Maliyet (birim) |
| --- | --- |
| Şarkı araması (`search.list`) | 100 |
| Video ayrıntısı (`videos.list`, 50 videoya kadar) | 1 |
| Listeye şarkı ekleme (`playlistItems.insert`) | 50 |
| Beğenme (`videos.rate`) | 50 |
| Liste oluşturma (`playlists.insert`) | 50 |
| Liste / şarkı okuma | 1 |

- Günlük varsayılan kota **10.000 birimdir** ve **Pasifik saatiyle gece yarısı** sıfırlanır.
- Hedef YouTube olduğunda şarkı başına yaklaşık 150 birim harcanır. Bu da günde ~60–65 şarkı demektir.
- Uygulama hedef seçim ekranında tahmini kota kullanımını gösterir.
- Kota dolunca işlem duraklar. Kota yenilendikten sonra aynı sayfadan devam edebilirsiniz.
- Daha önce eşleştirilen şarkılar tarayıcıda önbelleğe alınır ve tekrar aranmaz.
- Daha yüksek kota için Google'a **YouTube API Services – Audit and Quota Extension** formuyla başvurabilirsiniz.

**Diğer notlar**

- Uygulama "Testing" durumundayken Google, yenileme (refresh) token'larını **7 gün** sonra geçersiz kılar. Bu sürenin sonunda yeniden bağlanmanız gerekir.
- Herkese açık yayın için `youtube` kapsamı "hassas" sayıldığından Google uygulama doğrulaması gerekir.
- YouTube'da ISRC ile arama yoktur. Eşleştirme video başlığı, kanal adı ve süreye göre yapılır. Bu yüzden "Emin olunamayanlar" listesini kontrol etmeniz önerilir.
- "Beğenilen müzikler" olarak YouTube'da beğendiğiniz videolardan yalnızca **Müzik** kategorisindekiler alınır.

### Apple Music

> **Ücretli Apple Developer Program üyeliği (yıllık 99 USD) zorunludur.** Ayrıca aktarım yapacak kullanıcının aktif bir **Apple Music aboneliği** olmalıdır.

1. **Üyelik:** <https://developer.apple.com/programs/> adresinden Apple Developer Program'a kaydolun.
2. **Media ID oluşturma:** <https://developer.apple.com/account/resources/identifiers/list> sayfasında **+**'ya basın, **Media IDs**'i seçin ve **Continue** deyin. Açıklama ve ters alan adı biçiminde bir tanımlayıcı girin (ör. `media.com.ornek.aktarici`). **MusicKit** kutusunu işaretleyip kaydedin.
3. **Anahtar oluşturma:** **Keys** sayfasında (<https://developer.apple.com/account/resources/authkeys/list>) **+**'ya basın.
   - Anahtara bir ad verin.
   - **Media Services (MusicKit, ShazamKit, Apple Music Feed)** seçeneğini işaretleyin, **Configure**'a basın ve 2. adımdaki Media ID'yi seçin.
   - **Continue → Register** deyin.
   - **Download** ile `.p8` dosyasını indirin. **Bu dosya yalnızca bir kez indirilebilir**, güvenli bir yerde saklayın.
   - Sayfada görünen **Key ID**'yi not edin.
4. **Team ID:** <https://developer.apple.com/account> → **Membership details** sayfasındaki **Team ID**'yi kopyalayın.
5. **Ortam değişkenleri:**
   - `APPLE_TEAM_ID`: Team ID
   - `APPLE_KEY_ID`: Key ID
   - `APPLE_PRIVATE_KEY`: `.p8` dosyasının içeriği. Tek satırda, satır sonlarını `\n` olarak yazabilirsiniz:

     ```
     APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIGTAgEAMBMG...\n-----END PRIVATE KEY-----"
     ```

**Apple Music'e özgü notlar**

- **Redirect URI gerekmez.** Giriş, tarayıcıda **MusicKit JS** penceresiyle yapılır.
  - Sunucu `.p8` anahtarıyla kısa ömürlü, yalnızca `APP_URL` kaynağında geçerli bir "Developer Token" üretir.
  - Kullanıcının izniyle dönen "Music User Token" sunucuya gönderilir ve şifreli çereze yazılır.
  - `.p8` anahtarı sunucudan hiç çıkmaz.
- **Beğenilen şarkılar:** Apple Music API'sinde ayrı bir "beğenilen şarkılar" listesi yoktur.
  - Kaynak olarak **kitaplığınızdaki tüm şarkılar** alınır.
  - Hedefte "beğenme" işlemi, şarkının kitaplığa eklenmesi ve **"Sevdim"** olarak işaretlenmesi şeklinde yapılır.
- **Mağaza:** Katalog aramaları kullanıcının Apple Music mağazasında (ülkesinde) yapılır.

### Deezer

> ⚠️ **Deezer şu an yeni uygulama kaydı almıyor.** Geliştirici portalında uygulama oluşturmaya çalıştığınızda "We're not accepting new application creation at this time" mesajı çıkıyor. Deezer bu kaydın ne zaman yeniden açılacağını duyurmadı. Aşağıdaki adımlar, kayıt yeniden açılırsa ya da elinizde önceden oluşturulmuş bir uygulama varsa geçerlidir.

1. **Hesap:** <https://developers.deezer.com> adresine Deezer hesabınızla giriş yapın.
2. **Uygulama oluşturma:** <https://developers.deezer.com/myapps> sayfasında **Create a new Application**'a tıklayın.
   - **Application domain:** `127.0.0.1:3000` (yayında `uygulamaniz.vercel.app`)
   - **Redirect URL after authentication:** `http://127.0.0.1:3000/api/auth/deezer/callback`
3. **Anahtarlar:** Uygulama sayfasındaki **Application ID** ve **Secret Key** değerlerini `DEEZER_APP_ID` ve `DEEZER_APP_SECRET` alanlarına yazın.

**Deezer'a özgü notlar**

- **İstek sınırı:** Deezer 5 saniyede 50 istekle sınırlıdır. Uygulama bu sınıra göre kuyruk kullanır.
- **Oturum süresi:** `offline_access` izni istendiği için oturum süresiz kalır. Bağlantıyı arayüzden kesebilirsiniz.
- **Uygulamanız yoksa:** Deezer listelerinizi TuneMyMusic gibi bir araçla CSV'ye aktarıp aşağıdaki "Dosyadan içe aktarma" yoluyla diğer platformlara taşıyabilirsiniz.

---

## Dosyadan içe aktarma

Ana sayfadaki **Dosyadan içe aktar** düğmesiyle kaynak platforma giriş yapmadan aktarım yapabilirsiniz. Dosyalar **tarayıcıda işlenir, sunucuya yüklenmez**. Birden fazla dosyayı aynı anda seçebilirsiniz.

| Biçim | Nereden alınır | Notlar |
| --- | --- | --- |
| **Exportify CSV** | <https://exportify.net> | Sanatçılar, süre, varsa ISRC okunur. |
| **TuneMyMusic CSV** | TuneMyMusic → "Export to file" | `Playlist name` sütununa göre birden çok listeye ayrılır. `Type = Favorite` olanlar "Beğenilenler"e gider. |
| **Genel CSV** | Herhangi bir tablo | Başlıklar `Track/Title/Şarkı`, `Artist/Sanatçı`, `Album/Albüm`, `ISRC`, `Duration/Süre` gibi olmalı. |
| **Düz metin (.txt)** | Elle yazılmış liste | Her satırda `Sanatçı - Şarkı`. Numaralandırma (`1.`) ve süre (`(3:45)`) otomatik temizlenir. `#` ile başlayan satırlar yok sayılır. |
| **Spotify JSON** | Spotify → Hesap → Gizlilik ayarları → "Hesap verilerini indir" | `YourLibrary.json` (beğenilenler), `Playlist1.json` (listeler), `StreamingHistory*.json` (dinleme geçmişi). |

---

## Vercel'e yayınlama

1. Kodu bir GitHub/GitLab/Bitbucket deposuna gönderin.
2. <https://vercel.com/new> adresinde depoyu **Import** edin. Framework otomatik olarak **Next.js** algılanır, ayar değiştirmenize gerek yoktur. Depodaki `.npmrc` dosyası kurulumun sorunsuz geçmesini sağlar.
3. **Environment Variables** bölümüne `.env.example` dosyasındaki değişkenleri girin:
   - `APP_URL`: Vercel'in vereceği kalıcı adres, ör. `https://muzik-aktarici.vercel.app` (sonunda `/` olmadan). Özel alan adı kullanıyorsanız onu yazın.
   - `SESSION_SECRET`: yerelde kullandığınızdan **farklı** yeni bir rastgele değer.
   - Kullanacağınız platformların anahtarları.
   - `APPLE_PRIVATE_KEY`'i Vercel arayüzüne çok satırlı olarak doğrudan yapıştırabilirsiniz.
4. **Deploy**'a basın.
5. Her platformun geliştirici panelinde yayındaki redirect URI'yi ekleyin:
   - Spotify: `https://…/api/auth/spotify/callback`
   - Google: `https://…/api/auth/youtube/callback`
   - Deezer: domain ve `https://…/api/auth/deezer/callback`
6. Adres değişirse `APP_URL`'i güncelleyip yeniden deploy edin. Apple Developer Token, bu adrese kilitli (origin kısıtlı) üretilir.

> **Not:** Önizleme (preview) deploy'larının adresi her seferinde değiştiği için OAuth yalnızca `APP_URL`'deki adreste çalışır. Uzun işlemler parti parti yürütüldüğü için Vercel'in fonksiyon süre sınırları sorun oluşturmaz. Ağır route'larda `maxDuration = 60` tanımlıdır.

---

## Mimari

```
Tarayıcı (Next.js istemci)
  Sihirbaz: Kaynak → Seçim → Hedef → Eşleştirme/Kontrol → Aktarım → Rapor
  Orkestratör: işi küçük partilere böler, 429'da bekler, her adımı IndexedDB'ye yazar
  IndexedDB: aktarım işleri (devam ettirme) + eşleşme önbelleği
  Dosya ayrıştırıcıları: CSV / TXT / Spotify JSON
  MusicKit JS: yalnızca Apple girişi
            │  fetch /api/...
Sunucu (Next.js API route'ları, durumsuz)
  /api/auth/[platform]/login|callback|logout   OAuth + PKCE + state
  /api/auth/apple/developer-token|user-token   MusicKit
  /api/[platform]/playlists|tracks|match|playlist|add|like
  Şifreli HTTP-only çerezler (AES-256-GCM), otomatik token yenileme
  Limiter: eşzamanlılık sınırı + istekler arası aralık + Retry-After
            │
  Spotify · YouTube · Apple Music · Deezer
```

### Klasör yapısı

```
src/
├─ app/
│  ├─ layout.tsx, page.tsx, globals.css
│  ├─ transfer/page.tsx                    # sihirbaz
│  └─ api/
│     ├─ auth/[platform]/{login,callback,logout}/route.ts
│     ├─ auth/status/route.ts
│     ├─ auth/apple/{developer-token,user-token}/route.ts
│     └─ [platform]/{playlists,tracks,match,playlist,add,like}/route.ts
├─ components/
│  ├─ wizard/  (TransferWizard, SourceStep, SelectStep, TargetStep, MatchStep, TransferStep, ReportStep, RunStatus, useRunner)
│  ├─ ui.tsx, ConnectButton.tsx, FileImport.tsx, ResumeList.tsx, PlatformLogo.tsx, ThemeToggle.tsx, Providers.tsx
├─ lib/
│  ├─ types.ts                             # ortak veri modelleri
│  ├─ adapters/                            # platform adapter'ları
│  │  ├─ types.ts                          # MusicAdapter arayüzü
│  │  ├─ registry.ts
│  │  ├─ spotify.ts, youtube.ts, youtube-title.ts, apple.ts, deezer.ts
│  ├─ server/                              # yalnızca sunucu
│  │  ├─ crypto.ts, session.ts, oauth.ts, http.ts, apple-jwt.ts, config.ts, errors.ts, route-helpers.ts
│  ├─ matching/                            # normalize, similarity (Levenshtein), score, matcher
│  ├─ import/                              # csv, text, spotify-json
│  ├─ client/                              # api, job, job-store (IndexedDB), orchestrator, report, musickit
│  └─ i18n/tr.ts
tests/                                     # Vitest testleri
```

### Adapter arayüzü: yeni platform eklemek

Her platform `src/lib/adapters/types.ts` içindeki `MusicAdapter` arayüzünü uygular:

```ts
interface MusicAdapter {
  id; displayName; capabilities;           // isrcSearch, maxAddBatch, maxLikeBatch, authMode, quota?
  isConfigured(): boolean;
  login(params): LoginStart;               // OAuth yönlendirme URL'i veya MusicKit
  handleCallback?(params): Promise<StoredToken>;
  refresh?(token): Promise<StoredToken>;
  getPlaylists(token, cursor?);
  getLikedTracks(token, cursor?);
  getPlaylistTracks(token, playlistId, cursor?);
  searchTrack(token, query);               // { kind: "isrc" } | { kind: "text" }
  createPlaylist(token, name, description?);
  addTracks(token, playlistId, trackIds);
  likeTrack(token, trackIds);
}
```

Yeni bir platform (ör. Tidal) eklemek için dört adım yeterli:

1. `src/lib/adapters/tidal.ts` dosyasında bu arayüzü uygulayın.
2. `PLATFORM_IDS` listesine (`src/lib/types.ts`) `"tidal"` ekleyin.
3. `registry.ts`'e kaydedin.
4. `i18n/tr.ts`'e adını ve rengini ekleyin.

API route'ları, eşleştirme, orkestratör ve arayüz başka değişiklik gerektirmeden çalışır.

### Eşleştirme

1. **ISRC:** Kaynak şarkıda ISRC varsa ve hedef destekliyorsa (Spotify `isrc:` filtresi, Apple `filter[isrc]`, Deezer `/track/isrc:`) önce onunla aranır. Aynı ISRC ve uyumlu süre kesin eşleşme sayılır.
2. **Metin araması:** "İlk sanatçı + temizlenmiş başlık" ile arama yapılır. Sonuç zayıfsa yalnızca başlıkla gevşek arama yapılır. YouTube'da kotayı korumak için gevşek arama yalnızca hiç makul aday yoksa yapılır.
3. **Normalizasyon:**
   - Türkçe ve aksanlı karakterler katlanır: `ı/İ→i`, `ş→s`, `ğ→g`, `ç→c`, `ö→o`, `ü→u`, `é→e`, `ß→ss`.
   - Büyük/küçük harf ve noktalama farkları kaldırılır.
   - `feat./ft./with` kısımları başlıktan ayrılıp sanatçılara eklenir.
   - `(Live)`, `[Remastered 2011]`, `- Radio Edit` gibi parantez içi ve tireli ekler silinir.
4. **Puan (0–1):**
   - Başlık benzerliği %45 (Levenshtein, kelime sırasından bağımsız karşılaştırma ve kapsama)
   - Sanatçı benzerliği %35
   - Süre %20 (±3 sn tam puan, 20 sn'den fazla fark sıfır puan)
   - Canlı/remix/akustik/karaoke gibi sürüm uyuşmazlıklarına ceza puanı uygulanır.
   - Eksik bilgilerin (ör. süre) ağırlığı diğerlerine dağıtılır.
5. **Eşikler:**
   - ≥ 0,85: **Bulundu**
   - 0,55–0,85: **Emin değil** (kullanıcı adaylardan birini seçer)
   - < 0,55: **Bulunamadı**

   Eşikler `src/lib/matching/matcher.ts` içindeki `THRESHOLDS` sabitinden değiştirilebilir.

### İstek limitleri ve toplu işlemler

- **Sunucu:** Her platform için ayrı bir `Limiter` (`src/lib/server/http.ts`) aynı anda gönderilen istek sayısını sınırlar ve istekler arasında asgari aralık bırakır.
  - `429` alındığında `Retry-After` başlığı okunur ve **tüm kuyruk** o süre boyunca durdurulur.
  - Bekleme 20 saniyeden uzunsa iş istemciye devredilir. İstemci geri sayım gösterir ve aynı partiyi yeniden ister.
  - `5xx` ve ağ hatalarında üstel geri çekilme uygulanır.
- **Toplu işlem sınırları:**

  | Platform | Listeye ekleme | Beğenme |
  | --- | --- | --- |
  | Spotify | istek başına 100 şarkı | istek başına 40 |
  | Apple Music | 100 | 25 |
  | Deezer | 50 | tek tek |
  | YouTube | 1 (API toplu eklemeyi desteklemiyor) | 1 |

### Devam ettirme

- Aktarım durumu (seçilen listeler, okunan şarkılar, eşleşmeler, her listenin hedef kimliği ve kaçıncı şarkıya kadar aktarıldığı) her partiden sonra tarayıcının **IndexedDB**'sine yazılır.
- Aktarım başlarken her listenin "planı" dondurulur. Devam edildiğinde aynı sıra kullanılır ve eklenmiş şarkılar tekrar eklenmez.
- Hedefte liste oluşturulur oluşturulmaz kimliği kaydedilir, böylece liste iki kez oluşturulmaz.
- Ana sayfadaki **Aktarımlarınız** bölümünden yarım kalan işleri açabilirsiniz.
- Durum yalnızca işin başlatıldığı tarayıcıda saklanır.

---

## Güvenlik

- **Token'lar:** OAuth token'ları yalnızca sunucuda, **AES-256-GCM ile şifrelenmiş HTTP-only** çerezlerde tutulur. Çerezler üretimde `Secure`, her zaman `SameSite=Lax`'tir. JavaScript bu çerezleri okuyamaz.
- **Sırlar:** Client secret'lar ve Apple `.p8` anahtarı **asla istemciye gönderilmez**. MusicKit için tarayıcıya verilen Developer Token kısa ömürlüdür ve `APP_URL` kaynağına kilitlidir.
- **OAuth akışı:** OAuth'ta `state` (CSRF koruması) ve **PKCE** kullanılır. Geri dönüş adresi yalnızca site içi yollara izin verir (açık yönlendirme koruması).
- **İstek doğrulama:** POST isteklerinde `Origin` başlığı kontrol edilir. İstemciden gelen şarkı verisi sunucuda doğrulanıp temizlenir.
- **CSV güvenliği:** CSV dışa aktarımında Excel formül enjeksiyonuna karşı önlem alınır.

---

## Sık karşılaşılan sorunlar

| Belirti | Çözüm |
| --- | --- |
| Spotify girişinde `INVALID_CLIENT: Invalid redirect URI` | Dashboard'daki redirect URI, `APP_URL` + `/api/auth/spotify/callback` ile **birebir** aynı olmalı. `localhost` değil `127.0.0.1` kullanın. |
| Spotify girişi başarılı ama listeler `403` hatası veriyor | Hesabınızı Dashboard → User Management'a ekleyin. Uygulama sahibinin Premium aboneliğini kontrol edin. |
| Google: `Error 403: access_denied` | Hesabınızı OAuth izin ekranındaki **Test users** listesine ekleyin. |
| YouTube: "günlük API kotası doldu" | Kota Pasifik saatiyle gece yarısı sıfırlanır. Sonra aynı aktarımı açıp **Devam et**'e basın. |
| Giriş sonrası "state uyuşmuyor" | Tarayıcı adresi ile `APP_URL` farklı (ör. `localhost` ve `127.0.0.1`). Aynı adresi kullanın. |
| Apple: MusicKit penceresi açılmıyor | Açılır pencere engelleyiciyi kapatın. `APPLE_*` değişkenlerini ve `.p8` içeriğindeki satır sonlarını kontrol edin. |
| Deezer "Kullanılamıyor" görünüyor | `DEEZER_APP_ID/SECRET` tanımlı değil. Deezer şu an yeni uygulama kaydı almıyor, bkz. [Deezer](#deezer). |
