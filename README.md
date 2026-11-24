# Knihovník – katalog školní knihovny

Webová aplikace pro katalogizaci knih: skenování ISBN kamerou, ruční zadání ISBN,
rozpoznání knihy bez ISBN podle fotky obálky (AI) a galerie obálek.

Nasazení: GitHub Pages (`.github/workflows/deploy.yml`), po každém sloučení do `main`.

## Nastavení klíčů (GitHub → Settings → Secrets and variables → Actions)

| Secret | K čemu | Povinný |
| --- | --- | --- |
| `GEMINI_API_KEY` | Rozpoznání knihy podle fotky obálky (AI Google Gemini) | ne – bez něj si klíč zadá každý sám |
| `GOOGLE_BOOKS_API_KEY` | Vyšší limit dotazů do Google Books | ne |

### Jak bezpečně nastavit `GEMINI_API_KEY`

Klíč se při nasazení vloží do aplikace, takže **je veřejně vidět** (kdo umí otevřít
vývojářské nástroje prohlížeče, najde ho). Klíče pro Gemini API teď Google vytváří
„vázané na servisní účet“ a ty **omezit na adresu webu nejdou** (volba *Websites*
je zašedlá). Ochranou je proto hlavně to, že projekt nic neplatí:

1. **Bez placení:** klíč vytvořte na <https://aistudio.google.com/apikey> v projektu,
   který **nemá zapnuté placení (billing)**. Zkontrolujete to v
   <https://console.cloud.google.com/billing> u projektu klíče (obvykle
   „Default Gemini Project“). Pak se nikdy nic neplatí – v nejhorším případě někdo
   vyčerpá denní limit zdarma a AI do druhého dne nepůjde.
2. **Jen Gemini API:** v <https://console.cloud.google.com/apis/credentials>
   (nahoře vyberte projekt klíče) → klepněte na klíč → *API restrictions* má být
   jen **Gemini API**. *Application restrictions* nechte **None**.
3. **Uložení na GitHub:** Settings → Secrets and variables → Actions →
   **New repository secret** → název `GEMINI_API_KEY`, hodnota = klíč.
4. Nasazení se spustí po dalším sloučení do `main` (nebo ručně: Actions →
   „Deploy to GitHub Pages“ → **Run workflow**).

**Když by klíč někdo zneužil** (AI pořád hlásí vyčerpaný limit): u klíče v Google
Cloud klepněte na **Rotate key**, nový klíč uložte do secretu `GEMINI_API_KEY`
a spusťte nasazení znovu.

**Při vývoji na vlastním počítači** (`npm run dev`) společný klíč není – aplikace
nabídne políčko pro vlastní klíč. Můžete také vytvořit soubor `.env.local`
s řádkem `VITE_GEMINI_API_KEY=...` (soubor se do gitu nenahrává).

---

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
