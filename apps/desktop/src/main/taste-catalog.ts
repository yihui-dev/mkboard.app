// MkBoard system Taste seeds. These are style directions only, not source skill text.

export type SystemTasteSeed = {
  id: string;
  name: string;
  description: string;
  content: string;
  sourceUrl: string;
  preview: {
    background: string;
    foreground: string;
    accent: string;
  };
};

export const defaultTasteId = "taste-codex-paper-cut-studio";

type SystemTasteContentInput = {
  title: string;
  family: string;
  theme: string;
  coreLanguage: string[];
  bestFor: string;
  executionRules: string[];
  themeConstraints?: string[];
  tokens: Record<string, string>;
};

const systemTasteSourceUrl = "codex://mkboard/system-taste";

function createSystemTasteContent(input: SystemTasteContentInput): string {
  const coreLanguage = input.coreLanguage.map((item) => `- ${item}`).join("\n");
  const executionRules = input.executionRules.map((item) => `- ${item}`).join("\n");
  const themeConstraints = (
    input.themeConstraints ?? [
      "Keep this Taste's token set stable across every frame in the same project.",
      "If a frame idea conflicts with this Taste, preserve the frame's meaning but use this Taste for composition, typography, color, spacing, rhythm, and anti-pattern constraints.",
      "Avoid generic SaaS cards, overused purple gradients, decorative glassmorphism, floating blobs, and mixed visual systems unless the user explicitly asks for a hybrid."
    ]
  )
    .map((item) => `- ${item}`)
    .join("\n");
  const tokens = Object.entries(input.tokens)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join("\n");

  return `# ${input.title}

Source: MkBoard system Taste
Family: ${input.family}
Theme: ${input.theme}

## Visual System
Use this MkBoard Taste as a complete visual direction. It defines composition, typography, color, spacing, motion rhythm, image treatment, and anti-patterns.

Core language:
${coreLanguage}

Style rules:
${executionRules}

Theme constraints:
${themeConstraints}

## Selected Theme
${input.theme}

Best for: ${input.bestFor}

Tokens:
${tokens}

## Style Guardrails
- Keep the Taste focused on visual style only.
- Do not add source attribution, repository notes, slide-template instructions, or non-style operational steps.
- Prefer coherent sequential frames over one-off decorative posters.
`;
}

export const systemTasteSeeds: SystemTasteSeed[] = [
  {
    "id": "taste-guizang-style-b-ikb",
    "name": "International Klein Blue",
    "description": "Swiss International default theme. Pure paper background, near-black type, and an International Klein Blue anchor color for AI products, methods, technical launches, and data-driven explanations.",
    "content": createSystemTasteContent({
      title: "Style B · International Klein Blue",
      family: "Style B · Swiss International",
      theme: "International Klein Blue",
      coreLanguage: [
        "Grid-first information design inspired by Massimo Vignelli and Helvetica Forever.",
        "Pure paper background, black ink, hairline rules, straight corners, and one high-saturation anchor color.",
        "Fully sans-serif typographic hierarchy: huge type should feel light, while small labels should carry more weight.",
        "Best for AI products, technical methods, product analysis, data reporting, frameworks, annual summaries, and engineering or design talks."
      ],
      bestFor: "General business launches, AI and technology products, design talks, methods, and data-driven explanations.",
      executionRules: [
        "Treat each frame as a strict poster grid, not a decorative landing page.",
        "Use 16-column or 12-column grid logic, crisp alignment, rectangular blocks, and precise negative space.",
        "Use one accent color per project. No gradients, rounded image cards, glow shadows, mixed accent colors, or decorative glass.",
        "Treat images as evidence blocks rather than atmospheric backgrounds. Use straight edges and captions or grid labels for hierarchy.",
        "If using a hero image, frame it as a 21:9 or 16:10 evidence panel with strong typographic context.",
        "Do not mix with serif editorial fluidity unless the user explicitly asks for a hybrid."
      ],
      themeConstraints: [
        "Use only the selected Swiss accent variables below. Do not accept arbitrary hex overrides.",
        "Keep gray variables unified and only switch the selected accent token."
      ],
      tokens: {
        paper: "#fafaf8",
        paperRgb: "250,250,248",
        ink: "#0a0a0a",
        inkRgb: "10,10,10",
        grey1: "#f0f0ee",
        grey2: "#d4d4d2",
        grey3: "#737373",
        accent: "#002FA7",
        accentRgb: "0,47,167",
        accentOn: "#ffffff"
      }
    }),
    "sourceUrl": systemTasteSourceUrl,
    "preview": {
      "background": "#fafaf8",
      "foreground": "#0a0a0a",
      "accent": "#002FA7"
    }
  },
  {
    "id": "taste-guizang-style-b-lemon-yellow",
    "name": "Lemon Yellow",
    "description": "Energetic Swiss International theme. Warm off-white paper with a lemon-yellow anchor color for youth, sports, retail, consumer goods, and Y2K-inspired expression.",
    "content": createSystemTasteContent({
      title: "Style B · Lemon Yellow",
      family: "Style B · Swiss International",
      theme: "Lemon Yellow",
      coreLanguage: [
        "Grid-first information design inspired by Massimo Vignelli and Helvetica Forever.",
        "Pure paper background, black ink, hairline rules, straight corners, and one high-saturation anchor color.",
        "Fully sans-serif typographic hierarchy: huge type should feel light, while small labels should carry more weight.",
        "Best for energetic youth culture, sports, retail, consumer goods, active themes, and Y2K-inspired design."
      ],
      bestFor: "Youth culture, sports, retail, consumer products, energetic themes, and Y2K-inspired design.",
      executionRules: [
        "Treat each frame as a strict poster grid, not a decorative landing page.",
        "Use 16-column or 12-column grid logic, crisp alignment, rectangular blocks, and precise negative space.",
        "Let lemon yellow carry the main energy while black and off-white keep the layout controlled.",
        "Treat images as evidence blocks rather than atmospheric backgrounds. Use straight edges and captions or grid labels for hierarchy.",
        "If using a hero image, frame it as a 21:9 or 16:10 evidence panel with strong typographic context.",
        "Avoid gradients, rounded image cards, glow shadows, mixed accent colors, and decorative glass."
      ],
      themeConstraints: [
        "Use only the selected Swiss accent variables below. Do not accept arbitrary hex overrides.",
        "Keep gray variables unified and only switch the selected accent token."
      ],
      tokens: {
        paper: "#fafaf8",
        paperRgb: "250,250,248",
        ink: "#0a0a0a",
        inkRgb: "10,10,10",
        grey1: "#f0f0ee",
        grey2: "#d4d4d2",
        grey3: "#737373",
        accent: "#FFD500",
        accentRgb: "255,213,0",
        accentOn: "#0a0a0a"
      }
    }),
    "sourceUrl": systemTasteSourceUrl,
    "preview": {
      "background": "#fafaf8",
      "foreground": "#0a0a0a",
      "accent": "#FFD500"
    }
  },
  {
    "id": "taste-guizang-style-b-lemon-green",
    "name": "Lemon Green",
    "description": "Futuristic Swiss International theme. Warm off-white paper with a bright lemon-green anchor color for ecology, sustainability, health, emerging technology, and Gen Z brands.",
    "content": createSystemTasteContent({
      title: "Style B · Lemon Green",
      family: "Style B · Swiss International",
      theme: "Lemon Green",
      coreLanguage: [
        "Grid-first information design inspired by Massimo Vignelli and Helvetica Forever.",
        "Pure paper background, black ink, hairline rules, straight corners, and one high-saturation anchor color.",
        "Fully sans-serif typographic hierarchy: huge type should feel light, while small labels should carry more weight.",
        "Best for ecology, sustainability, health, emerging technology, Gen Z brands, and AI startup narratives."
      ],
      bestFor: "Ecology, sustainability, health, emerging technology, Gen Z brands, and AI startup projects.",
      executionRules: [
        "Treat each frame as a strict poster grid, not a decorative landing page.",
        "Use 16-column or 12-column grid logic, crisp alignment, rectangular blocks, and precise negative space.",
        "Let lemon green signal freshness, future direction, and energy while keeping the overall system restrained.",
        "Treat images as evidence blocks rather than atmospheric backgrounds. Use straight edges and captions or grid labels for hierarchy.",
        "If using a hero image, frame it as a 21:9 or 16:10 evidence panel with strong typographic context.",
        "Avoid soft eco cliches, gradients, rounded image cards, glow shadows, mixed accent colors, and decorative glass."
      ],
      themeConstraints: [
        "Use only the selected Swiss accent variables below. Do not accept arbitrary hex overrides.",
        "Keep gray variables unified and only switch the selected accent token."
      ],
      tokens: {
        paper: "#fafaf8",
        paperRgb: "250,250,248",
        ink: "#0a0a0a",
        inkRgb: "10,10,10",
        grey1: "#f0f0ee",
        grey2: "#d4d4d2",
        grey3: "#737373",
        accent: "#C5E803",
        accentRgb: "197,232,3",
        accentOn: "#0a0a0a"
      }
    }),
    "sourceUrl": systemTasteSourceUrl,
    "preview": {
      "background": "#fafaf8",
      "foreground": "#0a0a0a",
      "accent": "#C5E803"
    }
  },
  {
    "id": "taste-guizang-style-b-safety-orange",
    "name": "Safety Orange",
    "description": "Industrial Swiss International theme. Warm off-white paper with a safety-orange anchor color for warning, news, industry, sports, and urgent emphasis.",
    "content": createSystemTasteContent({
      title: "Style B · Safety Orange",
      family: "Style B · Swiss International",
      theme: "Safety Orange",
      coreLanguage: [
        "Grid-first information design inspired by Massimo Vignelli and Helvetica Forever.",
        "Pure paper background, black ink, hairline rules, straight corners, and one high-saturation anchor color.",
        "Fully sans-serif typographic hierarchy: huge type should feel light, while small labels should carry more weight.",
        "Best for industrial systems, warnings, sports, construction, automotive themes, and urgent technical launches."
      ],
      bestFor: "Industry, warnings, sports, construction, automotive design, and key pages in technical launches.",
      executionRules: [
        "Treat each frame as a strict poster grid, not a decorative landing page.",
        "Use 16-column or 12-column grid logic, crisp alignment, rectangular blocks, and precise negative space.",
        "Let safety orange create urgency through blocks, rules, and highlight panels rather than glow effects.",
        "Treat images as evidence blocks rather than atmospheric backgrounds. Use straight edges and captions or grid labels for hierarchy.",
        "If using a hero image, frame it as a 21:9 or 16:10 evidence panel with strong typographic context.",
        "Avoid hazard-tape clutter, gradients, rounded image cards, glow shadows, mixed accent colors, and decorative glass."
      ],
      themeConstraints: [
        "Use only the selected Swiss accent variables below. Do not accept arbitrary hex overrides.",
        "Keep gray variables unified and only switch the selected accent token."
      ],
      tokens: {
        paper: "#fafaf8",
        paperRgb: "250,250,248",
        ink: "#0a0a0a",
        inkRgb: "10,10,10",
        grey1: "#f0f0ee",
        grey2: "#d4d4d2",
        grey3: "#737373",
        accent: "#FF6B35",
        accentRgb: "255,107,53",
        accentOn: "#ffffff"
      }
    }),
    "sourceUrl": systemTasteSourceUrl,
    "preview": {
      "background": "#fafaf8",
      "foreground": "#0a0a0a",
      "accent": "#FF6B35"
    }
  },
  {
    "id": "taste-guizang-style-a-monocle-classic",
    "name": "Monocle Classic",
    "description": "Electronic magazine default theme. Pure ink-black with warm off-white paper for the strongest editorial feeling, suited to general talks, commercial launches, and narrative content.",
    "content": createSystemTasteContent({
      title: "Style A · Monocle Classic",
      family: "Style A · Electronic Magazine x Electronic Ink",
      theme: "Monocle Classic",
      coreLanguage: [
        "Magazine-like editorial rhythm, like Monocle with code stitched into the composition.",
        "Fluid, contour, and chromatic-dispersion backgrounds are part of the hero language.",
        "Use serif headlines, sans-serif body copy, and monospaced metadata to create layered editorial hierarchy.",
        "Best for narrative talks, industry observation, humanistic sharing, commercial launches, and opinion-led presentations."
      ],
      bestFor: "General talks, commercial launches, technology products, and safe editorial defaults for most scenarios.",
      executionRules: [
        "Build frames with strong opening titles, large typographic hierarchy, editorial metadata, and one clear visual idea.",
        "Alternate light, dark, hero-light, and hero-dark moods. Avoid three consecutive frames with the same mood.",
        "Keep standard image ratios: 16:9, 16:10, 4:3, 3:2, or 3:4. Do not invent odd screenshot ratios.",
        "Use cover-like title frames, act dividers, big-number grids, image-text splits, image grids, quotes, and contrast layouts as editorial composition patterns.",
        "Prefer calm magazine composition over generic SaaS cards, AI purple gradients, and default glassmorphism.",
        "Do not mix with Swiss grid components in the same frame unless the user explicitly asks for a hybrid."
      ],
      themeConstraints: [
        "Use only the selected theme variables below. Do not accept arbitrary hex overrides.",
        "Keep ink, paper, and tint values together as a set. Do not mix one theme's ink with another theme's paper."
      ],
      tokens: {
        ink: "#0a0a0b",
        inkRgb: "10,10,11",
        paper: "#f1efea",
        paperRgb: "241,239,234",
        paperTint: "#e8e5de",
        inkTint: "#18181a"
      }
    }),
    "sourceUrl": systemTasteSourceUrl,
    "preview": {
      "background": "linear-gradient(135deg, #0a0a0b 0%, #18181a 48%, #f1efea 100%)",
      "foreground": "#f1efea",
      "accent": "#e8e5de"
    }
  },
  {
    "id": "taste-guizang-style-a-indigo-porcelain",
    "name": "Indigo Porcelain",
    "description": "Electronic magazine technology theme. Deep indigo with porcelain white for a calm, rational, and layered style suited to research, AI, data, and technical launches.",
    "content": createSystemTasteContent({
      title: "Style A · Indigo Porcelain",
      family: "Style A · Electronic Magazine x Electronic Ink",
      theme: "Indigo Porcelain",
      coreLanguage: [
        "Magazine-like editorial rhythm, like Monocle with code stitched into the composition.",
        "Fluid, contour, and chromatic-dispersion backgrounds are part of the hero language.",
        "Use serif headlines, sans-serif body copy, and monospaced metadata to create layered editorial hierarchy.",
        "Best for technology, research, data sharing, engineering culture, deep content, and technical launches."
      ],
      bestFor: "Technology, research, data sharing, engineering culture, deep content, and technical launches.",
      executionRules: [
        "Build frames with strong opening titles, large typographic hierarchy, editorial metadata, and one clear visual idea.",
        "Alternate light, dark, hero-light, and hero-dark moods. Avoid three consecutive frames with the same mood.",
        "Use indigo for depth and porcelain white for clarity; keep the atmosphere calm and intellectual.",
        "Keep standard image ratios: 16:9, 16:10, 4:3, 3:2, or 3:4. Do not invent odd screenshot ratios.",
        "Prefer calm magazine composition over generic SaaS cards, AI purple gradients, and default glassmorphism.",
        "Do not mix with Swiss grid components in the same frame unless the user explicitly asks for a hybrid."
      ],
      themeConstraints: [
        "Use only the selected theme variables below. Do not accept arbitrary hex overrides.",
        "Keep ink, paper, and tint values together as a set. Do not mix one theme's ink with another theme's paper."
      ],
      tokens: {
        ink: "#0a1f3d",
        inkRgb: "10,31,61",
        paper: "#f1f3f5",
        paperRgb: "241,243,245",
        paperTint: "#e4e8ec",
        inkTint: "#152a4a"
      }
    }),
    "sourceUrl": systemTasteSourceUrl,
    "preview": {
      "background": "linear-gradient(135deg, #0a1f3d 0%, #152a4a 50%, #f1f3f5 100%)",
      "foreground": "#f1f3f5",
      "accent": "#e4e8ec"
    }
  },
  {
    "id": "taste-guizang-style-a-forest-ink",
    "name": "Forest Ink",
    "description": "Electronic magazine nature theme. Deep forest green with ivory paper for a steady, breathable style suited to culture, nonfiction, and sustainability themes.",
    "content": createSystemTasteContent({
      title: "Style A · Forest Ink",
      family: "Style A · Electronic Magazine x Electronic Ink",
      theme: "Forest Ink",
      coreLanguage: [
        "Magazine-like editorial rhythm, like Monocle with code stitched into the composition.",
        "Fluid, contour, and chromatic-dispersion backgrounds are part of the hero language.",
        "Use serif headlines, sans-serif body copy, and monospaced metadata to create layered editorial hierarchy.",
        "Best for nature, sustainability, culture, nonfiction, outdoor brands, and environmental themes."
      ],
      bestFor: "Nature, sustainability, culture, nonfiction, outdoor brands, and environmental themes.",
      executionRules: [
        "Build frames with strong opening titles, large typographic hierarchy, editorial metadata, and one clear visual idea.",
        "Alternate light, dark, hero-light, and hero-dark moods. Avoid three consecutive frames with the same mood.",
        "Use forest green for grounded authority and ivory paper for breathable editorial space.",
        "Keep standard image ratios: 16:9, 16:10, 4:3, 3:2, or 3:4. Do not invent odd screenshot ratios.",
        "Prefer calm magazine composition over generic SaaS cards, AI purple gradients, and default glassmorphism.",
        "Do not mix with Swiss grid components in the same frame unless the user explicitly asks for a hybrid."
      ],
      themeConstraints: [
        "Use only the selected theme variables below. Do not accept arbitrary hex overrides.",
        "Keep ink, paper, and tint values together as a set. Do not mix one theme's ink with another theme's paper."
      ],
      tokens: {
        ink: "#1a2e1f",
        inkRgb: "26,46,31",
        paper: "#f5f1e8",
        paperRgb: "245,241,232",
        paperTint: "#ece7da",
        inkTint: "#253d2c"
      }
    }),
    "sourceUrl": systemTasteSourceUrl,
    "preview": {
      "background": "linear-gradient(135deg, #1a2e1f 0%, #253d2c 50%, #f5f1e8 100%)",
      "foreground": "#f5f1e8",
      "accent": "#ece7da"
    }
  },
  {
    "id": "taste-guizang-style-a-kraft-paper",
    "name": "Kraft Paper",
    "description": "Electronic magazine nostalgia theme. Deep brown with warm rice-paper tones, like kraft envelopes or old notebooks, suited to humanities, reading, history, and literary sharing.",
    "content": createSystemTasteContent({
      title: "Style A · Kraft Paper",
      family: "Style A · Electronic Magazine x Electronic Ink",
      theme: "Kraft Paper",
      coreLanguage: [
        "Magazine-like editorial rhythm, like Monocle with code stitched into the composition.",
        "Fluid, contour, and chromatic-dispersion backgrounds are part of the hero language.",
        "Use serif headlines, sans-serif body copy, and monospaced metadata to create layered editorial hierarchy.",
        "Best for nostalgia, humanities, reading, history, literary sharing, independent magazines, and handmade brands."
      ],
      bestFor: "Nostalgia, humanities, reading, history, literary sharing, independent magazines, and handmade brands.",
      executionRules: [
        "Build frames with strong opening titles, large typographic hierarchy, editorial metadata, and one clear visual idea.",
        "Alternate light, dark, hero-light, and hero-dark moods. Avoid three consecutive frames with the same mood.",
        "Use deep brown as ink and warm paper tones for a tactile archive feeling without over-aging the design.",
        "Keep standard image ratios: 16:9, 16:10, 4:3, 3:2, or 3:4. Do not invent odd screenshot ratios.",
        "Prefer calm magazine composition over generic SaaS cards, AI purple gradients, and default glassmorphism.",
        "Do not mix with Swiss grid components in the same frame unless the user explicitly asks for a hybrid."
      ],
      themeConstraints: [
        "Use only the selected theme variables below. Do not accept arbitrary hex overrides.",
        "Keep ink, paper, and tint values together as a set. Do not mix one theme's ink with another theme's paper."
      ],
      tokens: {
        ink: "#2a1e13",
        inkRgb: "42,30,19",
        paper: "#eedfc7",
        paperRgb: "238,223,199",
        paperTint: "#e0d0b6",
        inkTint: "#3a2a1d"
      }
    }),
    "sourceUrl": systemTasteSourceUrl,
    "preview": {
      "background": "linear-gradient(135deg, #2a1e13 0%, #3a2a1d 50%, #eedfc7 100%)",
      "foreground": "#eedfc7",
      "accent": "#e0d0b6"
    }
  },
  {
    "id": "taste-guizang-style-a-dune",
    "name": "Dune",
    "description": "Electronic magazine art theme. Charcoal with sand tones for a restrained, elevated, neutral style suited to art, design, creative work, fashion, and gallery-like content.",
    "content": createSystemTasteContent({
      title: "Style A · Dune",
      family: "Style A · Electronic Magazine x Electronic Ink",
      theme: "Dune",
      coreLanguage: [
        "Magazine-like editorial rhythm, like Monocle with code stitched into the composition.",
        "Fluid, contour, and chromatic-dispersion backgrounds are part of the hero language.",
        "Use serif headlines, sans-serif body copy, and monospaced metadata to create layered editorial hierarchy.",
        "Best for art, design, creative talks, fashion sharing, gallery guides, and taste-first private presentations."
      ],
      bestFor: "Art, design, creative work, fashion sharing, gallery booklets, and taste-first private sessions.",
      executionRules: [
        "Build frames with strong opening titles, large typographic hierarchy, editorial metadata, and one clear visual idea.",
        "Alternate light, dark, hero-light, and hero-dark moods. Avoid three consecutive frames with the same mood.",
        "Use charcoal for restraint and sand tones for warmth; keep the composition neutral and refined.",
        "Keep standard image ratios: 16:9, 16:10, 4:3, 3:2, or 3:4. Do not invent odd screenshot ratios.",
        "Prefer calm magazine composition over generic SaaS cards, AI purple gradients, and default glassmorphism.",
        "Do not mix with Swiss grid components in the same frame unless the user explicitly asks for a hybrid."
      ],
      themeConstraints: [
        "Use only the selected theme variables below. Do not accept arbitrary hex overrides.",
        "Keep ink, paper, and tint values together as a set. Do not mix one theme's ink with another theme's paper."
      ],
      tokens: {
        ink: "#1f1a14",
        inkRgb: "31,26,20",
        paper: "#f0e6d2",
        paperRgb: "240,230,210",
        paperTint: "#e3d7bf",
        inkTint: "#2d2620"
      }
    }),
    "sourceUrl": systemTasteSourceUrl,
    "preview": {
      "background": "linear-gradient(135deg, #1f1a14 0%, #2d2620 50%, #f0e6d2 100%)",
      "foreground": "#f0e6d2",
      "accent": "#e3d7bf"
    }
  },
  {
    id: "taste-codex-noir-console",
    name: "Noir Console",
    description: "Dark console theme. Near-black surfaces with champagne gold and acid green for AI tools, security, finance, data monitoring, and strongly technical video styles.",
    content: createSystemTasteContent({
      title: "Noir Console",
      family: "Dark Interface",
      theme: "Noir Console",
      coreLanguage: [
        "Deep operational interface language: black surfaces, gold rules, acidic green status signals, and dense but legible data panels.",
        "Use sharp rectangles, terminal strips, mono metadata, thin separators, and controlled negative space.",
        "Best visual rhythm is command-center calm, not cyberpunk chaos."
      ],
      bestFor: "AI products, security workflows, trading dashboards, technical demos, system monitoring, and high-stakes product narratives.",
      executionRules: [
        "Treat each frame like an instrument panel with one dominant message and two to three supporting signals.",
        "Use mono labels, timestamps, status chips, wire grids, and subtle scan lines as structure.",
        "Keep accents disciplined: champagne gold for hierarchy, acid green only for live/ready/active signals.",
        "Avoid neon rainbow palettes, fake holograms, heavy blur, and unreadable tiny terminal walls."
      ],
      tokens: {
        background: "#08090b",
        surface: "#111318",
        foreground: "#f4efe4",
        muted: "#8a8173",
        accent: "#d6ad60",
        signal: "#b8ff4d",
        line: "#2a2e35"
      }
    }),
    sourceUrl: systemTasteSourceUrl,
    preview: {
      background: "#08090b",
      foreground: "#f4efe4",
      accent: "#d6ad60"
    }
  },
  {
    id: "taste-codex-paper-cut-studio",
    name: "Paper Cut Studio",
    description: "Paper craft collage theme. Handmade paper, light shadows, and clean color blocks for courses, approachable brands, educational content, and friendly explainers.",
    content: createSystemTasteContent({
      title: "Paper Cut Studio",
      family: "Paper Craft",
      theme: "Paper Cut Studio",
      coreLanguage: [
        "Layered paper composition with cut-paper edges, modest shadows, tactile texture, and friendly editorial layouts.",
        "Use coral, sky blue, leaf green, and warm paper as a controlled palette.",
        "The style should feel handcrafted and organized, not childish or scrapbook-heavy."
      ],
      bestFor: "Education, course explainers, creator brands, light product tutorials, onboarding, and friendly concept storytelling.",
      executionRules: [
        "Build scenes from flat paper layers, simple labels, clear arrows, and calm cutout shapes.",
        "Keep text large and sparse; one concept per frame.",
        "Use paper texture and shadow for hierarchy instead of gradients or glow.",
        "Avoid stickers, emoji overload, messy collage density, and toy-like illustration unless requested."
      ],
      tokens: {
        paper: "#fbf3e6",
        ink: "#243033",
        coral: "#ff6f61",
        sky: "#77c8e8",
        leaf: "#82b366",
        butter: "#f6d66b",
        shadow: "rgba(36,48,51,0.16)"
      }
    }),
    sourceUrl: systemTasteSourceUrl,
    preview: {
      background: "#fbf3e6",
      foreground: "#243033",
      accent: "#ff6f61"
    }
  },
  {
    id: "taste-codex-clinical-whiteprint",
    name: "Clinical Whiteprint",
    description: "Clinical whiteprint theme. Cool white surfaces, blue-green annotations, and precise wireframes for healthcare, research, complex processes, B2B SaaS, and serious explainers.",
    content: createSystemTasteContent({
      title: "Clinical Whiteprint",
      family: "Clinical Diagram",
      theme: "Clinical Whiteprint",
      coreLanguage: [
        "Clinical clarity with white surfaces, blueprint lines, cyan annotations, and measured information density.",
        "Use diagrams, callouts, process lanes, cross-sections, and clean interface fragments.",
        "The tone is precise, credible, and calm."
      ],
      bestFor: "Healthcare, research, scientific explainers, B2B workflows, compliance, diagnostics, and complex product education.",
      executionRules: [
        "Use white space as the primary material; do not fill every area.",
        "Prefer thin-line diagrams, numbered callouts, flow lanes, and evidence panels.",
        "Use cyan for annotation and navy for authority; keep red only for rare warning states.",
        "Avoid decorative medical icons, glossy 3D pills, generic hospital stock scenes, and cluttered dashboards."
      ],
      tokens: {
        background: "#f7fbff",
        foreground: "#102033",
        muted: "#6d7f8f",
        cyan: "#00a7c8",
        navy: "#12355b",
        mint: "#dff5ee",
        line: "#c8d7e5"
      }
    }),
    sourceUrl: systemTasteSourceUrl,
    preview: {
      background: "#f7fbff",
      foreground: "#102033",
      accent: "#00a7c8"
    }
  },
  {
    id: "taste-codex-candy-pop-grid",
    name: "Candy Pop Grid",
    description: "High-energy pop theme. Pink, cyan, yellow, and black grid contrast for consumer products, social videos, event drops, and young brands.",
    content: createSystemTasteContent({
      title: "Candy Pop Grid",
      family: "Pop Grid",
      theme: "Candy Pop Grid",
      coreLanguage: [
        "Bright pop layout system with hard grid blocks, oversized type, candy colors, and product-poster energy.",
        "Use black structure to keep the palette sharp and premium rather than childish.",
        "Motion should feel snappy, modular, and social-first."
      ],
      bestFor: "Consumer products, campaigns, social media hooks, event drops, creator launches, and upbeat brand explainers.",
      executionRules: [
        "Use big cropped words, hard color panels, sticker-like labels, and fast modular transitions.",
        "Keep one dominant candy color per frame, with black and white stabilizing the composition.",
        "Make calls to action and hooks large enough for mobile viewing.",
        "Avoid soft pastel mush, gradient blobs, excessive rounded cards, and low-contrast type."
      ],
      tokens: {
        background: "#fff8f0",
        ink: "#101014",
        hotPink: "#ff4fa3",
        aqua: "#00d1c1",
        lemon: "#ffe14a",
        violet: "#7c5cff",
        line: "#101014"
      }
    }),
    sourceUrl: systemTasteSourceUrl,
    preview: {
      background: "#fff8f0",
      foreground: "#101014",
      accent: "#ff4fa3"
    }
  },
  {
    id: "taste-codex-analog-film-notebook",
    name: "Analog Film Notebook",
    description: "Analog documentary theme. Warm black, rice paper, amber highlights, and film grain for personal stories, documentary content, behind-the-scenes records, and brand narratives.",
    content: createSystemTasteContent({
      title: "Analog Film Notebook",
      family: "Analog Documentary",
      theme: "Analog Film Notebook",
      coreLanguage: [
        "Warm documentary editorial language: film frames, notebook margins, contact sheets, amber highlights, and restrained serif moments.",
        "Use imperfect texture carefully; the design should feel observed, not artificially vintage.",
        "Best when combining stills, quotes, notes, and time markers."
      ],
      bestFor: "Founder stories, documentary shorts, behind-the-scenes content, culture writing, lifestyle brands, and reflective course narratives.",
      executionRules: [
        "Frame images as contact sheets, film strips, annotated notes, or editorial spreads.",
        "Use amber only for emphasis and chapter markers; keep most text in warm paper or charcoal.",
        "Let grain and vignette stay subtle enough for subtitles and UI text to remain clear.",
        "Avoid sepia filters over everything, fake polaroid clutter, and nostalgia effects that hide information."
      ],
      tokens: {
        background: "#17130f",
        paper: "#eadcc3",
        foreground: "#f7ead4",
        amber: "#d99a3d",
        red: "#9b3d2e",
        muted: "#8f7b61",
        line: "#3a3027"
      }
    }),
    sourceUrl: systemTasteSourceUrl,
    preview: {
      background: "#17130f",
      foreground: "#f7ead4",
      accent: "#d99a3d"
    }
  },
  {
    id: "taste-codex-blueprint-motion",
    name: "Blueprint Motion",
    description: "Blueprint motion theme. Deep blue paper, cyan engineering lines, and dynamic paths for product flows, architecture explanations, system breakdowns, and engineering demos.",
    content: createSystemTasteContent({
      title: "Blueprint Motion",
      family: "Blueprint Motion",
      theme: "Blueprint Motion",
      coreLanguage: [
        "Engineering blueprint motion language with deep blue paper, cyan construction lines, coordinate marks, and animated path logic.",
        "Use diagrams as the hero, supported by terse labels and measured motion.",
        "The style should make systems feel understandable and buildable."
      ],
      bestFor: "Product architecture, system diagrams, workflow breakdowns, process videos, robotics, developer tools, and planning explainers.",
      executionRules: [
        "Use node-link maps, path traces, measurement ticks, crosshair guides, and layer reveals.",
        "Keep labels short and aligned to the grid; motion should reveal structure step by step.",
        "Use cyan for active paths, pale blue for dormant structure, and white for final emphasis.",
        "Avoid fake CAD clutter, unreadable micro labels, heavy glow, and decorative sci-fi HUD noise."
      ],
      tokens: {
        background: "#071b3a",
        foreground: "#eef7ff",
        cyan: "#37d5ff",
        blue: "#2f80ed",
        grid: "#23486f",
        muted: "#8fb3d9",
        line: "#58c7ff"
      }
    }),
    sourceUrl: systemTasteSourceUrl,
    preview: {
      background: "#071b3a",
      foreground: "#eef7ff",
      accent: "#37d5ff"
    }
  }
];
