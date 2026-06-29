import spear        from '@/assets/images/unit_spear@2x.webp'
import sword        from '@/assets/images/unit_sword@2x.webp'
import axe          from '@/assets/images/unit_axe@2x.webp'
import spy          from '@/assets/images/unit_spy@2x.webp'
import light        from '@/assets/images/unit_light@2x.webp'
import heavy        from '@/assets/images/unit_heavy@2x.webp'
import ram          from '@/assets/images/unit_ram@2x.webp'
import catapult     from '@/assets/images/unit_catapult@2x.webp'
import knight       from '@/assets/images/unit_knight.webp'
import snob         from '@/assets/images/unit_snob.webp'
import wall         from '@/assets/images/wall.webp'
import watchtower   from '@/assets/images/watchtower.webp'
import attackSmall  from '@/assets/images/attack_small.webp'
import attackMedium from '@/assets/images/attack_medium.webp'
import attackLarge  from '@/assets/images/attack_large.webp'

export const UNIT_ICONS: Record<string, string> = {
  spear, sword, axe, spy, light, heavy, ram, catapult, knight, snob,
}

export { wall as wallIcon, watchtower as watchtowerIcon }
export { attackSmall, attackMedium, attackLarge }
