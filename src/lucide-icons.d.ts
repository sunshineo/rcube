declare module 'lucide/dist/esm/createElement.mjs' {
  type IconNode = [tag: string, attrs: Record<string, string | number | undefined>][]

  export default function createElement(
    iconNode: IconNode,
    attrs?: Record<string, string | number | undefined>,
  ): SVGSVGElement
}

declare module 'lucide/dist/esm/icons/*.mjs' {
  type IconNode = [tag: string, attrs: Record<string, string | number | undefined>][]
  const iconNode: IconNode
  export default iconNode
}
