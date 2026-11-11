import {
  Home, Zap, Smartphone, ShoppingCart, Utensils, Sparkles, Fuel, Car, TrainFront, ShoppingBag, Repeat,
  Dumbbell, PartyPopper, Plane, HeartPulse, GraduationCap, Gift, Landmark, CircleEllipsis, Briefcase, Laptop,
  TrendingUp, RotateCcw, CirclePlus, Wallet, CreditCard, PiggyBank, Receipt, Banknote, Target, Circle,
  Coffee, Book, Music, Gamepad2, Baby, Dog, Shirt, Wrench, Umbrella, Bike, Bus, Film, Pill, Scissors, Tv,
  Building2, Shield, Mountain, Palmtree, Heart, Star, Gem, House, type LucideIcon,
} from 'lucide-react'

export const ICONS: Record<string, LucideIcon> = {
  home: Home, zap: Zap, smartphone: Smartphone, 'shopping-cart': ShoppingCart, utensils: Utensils,
  sparkles: Sparkles, fuel: Fuel, car: Car, 'train-front': TrainFront, 'shopping-bag': ShoppingBag,
  repeat: Repeat, dumbbell: Dumbbell, 'party-popper': PartyPopper, plane: Plane, 'heart-pulse': HeartPulse,
  'graduation-cap': GraduationCap, gift: Gift, landmark: Landmark, 'circle-ellipsis': CircleEllipsis,
  briefcase: Briefcase, laptop: Laptop, 'trending-up': TrendingUp, 'rotate-ccw': RotateCcw,
  'circle-plus': CirclePlus, wallet: Wallet, 'credit-card': CreditCard, 'piggy-bank': PiggyBank,
  receipt: Receipt, banknote: Banknote, target: Target, circle: Circle, coffee: Coffee, book: Book,
  music: Music, gamepad: Gamepad2, baby: Baby, dog: Dog, shirt: Shirt, wrench: Wrench, umbrella: Umbrella,
  bike: Bike, bus: Bus, film: Film, pill: Pill, scissors: Scissors, tv: Tv, building: Building2,
  shield: Shield, mountain: Mountain, palmtree: Palmtree, heart: Heart, star: Star, gem: Gem, house: House,
}

export const ICON_NAMES = Object.keys(ICONS)

export const COLORS = [
  '#0f4d3a', '#10b981', '#22c55e', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#ef4444', '#f97316', '#f59e0b',
  '#eab308', '#a87b22', '#64748b', '#94a3b8',
]

export function Icon({ name, size = 18, className }: { name: string; size?: number; className?: string }) {
  const C = ICONS[name] ?? Circle
  return <C size={size} className={className} strokeWidth={1.9} />
}

/** Bollino tondo colorato con icona: usato per categorie e conti. */
export function Badge({ icon, color, size = 40 }: { icon: string; color: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size, background: `color-mix(in oklab, ${color} 16%, transparent)`, color }}
    >
      <Icon name={icon} size={Math.round(size * 0.45)} />
    </span>
  )
}
