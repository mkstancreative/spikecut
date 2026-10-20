// Shared by the Animate page, the API and the worker, so all three agree on what each style means and costs.

// fal = paid generative AI · local = DCT-Net Light filter · grade = FFmpeg colour grade · draw = OpenCV drawn look.
// Everything except fal runs on SpikeCut's own worker and is free.
export type CartoonEngine = 'fal' | 'local' | 'grade' | 'draw'
export type CartoonStyleId =
  | 'light'
  | 'pixar3d'
  | 'anime'
  | 'claymation'
  | 'comic'
  | 'watercolor'
  | 'sketch'
  | 'teal'
  | 'golden'
  | 'vintage'
  | 'noir'

export const cartoonStyles: {
  id: CartoonStyleId
  label: string
  blurb: string
  engine: CartoonEngine
  prompt?: string // fal only
}[] = [
  {
    id: 'pixar3d',
    label: '3D animated',
    blurb: 'Pixar-style 3D film look — rounded, expressive characters and soft lighting',
    engine: 'fal',
    prompt:
      '3D animated film style, Pixar-like CGI, soft global illumination, expressive stylised characters with smooth rounded shapes, vibrant colours, keep each person recognisable and keep their skin tone',
  },
  {
    id: 'anime',
    label: 'Anime',
    blurb: 'Hand-painted anime with clean line art and cel shading',
    engine: 'fal',
    prompt: 'Japanese anime style, clean line art, cel shading, painted backgrounds, keep each person recognisable and keep their skin tone',
  },
  {
    id: 'claymation',
    label: 'Claymation',
    blurb: 'Stop-motion clay figures with fingerprint texture',
    engine: 'fal',
    prompt: 'claymation stop-motion style, plasticine figures with visible clay texture, miniature set, keep their skin tone',
  },
  {
    id: 'comic',
    label: 'Comic book',
    blurb: 'Bold ink outlines, halftone shading and punchy colour',
    engine: 'fal',
    prompt: 'comic book illustration style, bold black ink outlines, halftone shading, flat saturated colours, keep their skin tone',
  },
  {
    id: 'light',
    label: 'Light filter',
    blurb: 'A subtle smoothed, slightly 3D look — best on close-ups',
    engine: 'local',
  },
  { id: 'watercolor', label: 'Watercolor', blurb: 'Soft painted colour with clean outlines', engine: 'draw' },
  { id: 'sketch', label: 'Pencil sketch', blurb: 'Black-and-white pencil drawing', engine: 'draw' },
  { id: 'teal', label: 'Teal & orange', blurb: 'Blockbuster colour grade — warm skin, cool shadows', engine: 'grade' },
  { id: 'golden', label: 'Golden hour', blurb: 'Warm, glowing sunset tones', engine: 'grade' },
  { id: 'vintage', label: 'Vintage film', blurb: 'Sepia tones, film grain and a soft vignette', engine: 'grade' },
  { id: 'noir', label: 'Noir', blurb: 'High-contrast black and white', engine: 'grade' },
]

/** Free styles run on SpikeCut's own worker; only the generative AI styles cost credits. */
export const isFreeStyle = (id: unknown) => {
  const style = cartoonStyle(id)
  return !!style && style.engine !== 'fal'
}

export const cartoonStyle = (id: unknown) => cartoonStyles.find((s) => s.id === id)
export const isCartoonStyle = (id: unknown): id is CartoonStyleId => !!cartoonStyle(id)

/** fal's Lucy Restyle takes sources up to 30 minutes. The free styles are held to the same limit. */
export const MAX_CARTOON_SECONDS = 30 * 60
export const MAX_DETAILS_CHARS = 300

/** AI styles cost 1 credit per started minute (the provider bills per second); free styles cost nothing. */
export function creditsFor(style: CartoonStyleId, seconds: number) {
  return isFreeStyle(style) ? 0 : Math.max(1, Math.ceil(seconds / 60))
}

export const uploadMimeTypes = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska']
