import cottonFlower from '../assets/site/flower.png'

/*
 * The AIZEN cotton-flower mark.
 *
 * One asset for the whole product: the public site and the Risk Management
 * shell must never drift onto different logos. The mark is navy on white, so
 * on the dark rail it sits inside a light badge rather than being recoloured.
 */
export function BrandMark({ label, className }: { label: string; className?: string }) {
  return (
    <span className={className ? `brand-mark ${className}` : 'brand-mark'}>
      <img src={cottonFlower} alt={label} />
    </span>
  )
}
