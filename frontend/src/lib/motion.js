import { useReducedMotion } from 'motion/react'

/* Shared motion vocabulary.

   Every animation in the app pulls its timing from here, so the console and the
   shop feel like they were built by the same hand even though they look nothing
   alike. Two zones with different easing read as two different products that
   happen to share a URL.

   Springs rather than durations for anything that responds to a person: a spring
   interrupted mid-flight carries its velocity into the new target, so a fast
   clicker never sees a stutter. Durations are kept for pure opacity, where
   physics buys nothing. */

export const SPRING = {
  /* Direct response to a tap or hover — has to feel instant, not bouncy. */
  snappy: { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 },

  /* Something arriving on screen. A little overshoot reads as alive. */
  soft: { type: 'spring', stiffness: 190, damping: 24 },

  /* Ambient drift for the product wall — heavy and slow so it feels like
     weight moving, not a UI element twitching. */
  float: { type: 'spring', stiffness: 38, damping: 18, mass: 1.5 },

  /* Layout reflow when a rail or list changes shape. */
  layout: { type: 'spring', stiffness: 260, damping: 30 },

  /* The frontage score counting up. Deliberately overdamped (ratio ~1.35) so it
     never overshoots: 100 is the ceiling of the scale, and a spring that bounced
     would flash 103 on the way there. Takes roughly 1.2s, which is long enough
     to travel alongside the six bays lighting on their 110ms stagger rather than
     finishing before them. */
  score: { type: 'spring', stiffness: 55, damping: 20, mass: 1 },
}

export const EASE = {
  /* Fast out, slow in. The standard "settling into place" curve. */
  out: [0.22, 1, 0.36, 1],
  inOut: [0.65, 0, 0.35, 1],
}

export const DURATION = {
  fast: 0.18,
  base: 0.28,
  slow: 0.5,
}

export const STAGGER = {
  tight: 0.04,
  normal: 0.07,
  loose: 0.12,
}

/* The one gate every animation checks.

   Returns false when the visitor has asked for reduced motion, in which case
   callers should render the end state directly rather than animating to it.
   The CSS block in base.css is the backstop for anything declarative; this is
   for the JS-driven work Motion does, which that media query cannot reach. */
export function useMotionOK() {
  return !useReducedMotion()
}

/* Variants used widely enough to be worth naming once. */

export const fadeRise = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: SPRING.soft },
  exit: { opacity: 0, y: -8, transition: { duration: DURATION.fast, ease: EASE.out } },
}

export const fade = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DURATION.base, ease: EASE.out } },
  exit: { opacity: 0, transition: { duration: DURATION.fast } },
}

export function staggerParent(gap = STAGGER.normal, delay = 0) {
  return {
    hidden: {},
    visible: {
      transition: { staggerChildren: gap, delayChildren: delay },
    },
    exit: {
      transition: { staggerChildren: STAGGER.tight, staggerDirection: -1 },
    },
  }
}

/* Collapses any variant set to its end state. Used when motion is off so a
   component keeps one code path instead of branching its whole render. */
export const STILL = {
  hidden: { opacity: 1, y: 0 },
  visible: { opacity: 1, y: 0, transition: { duration: 0 } },
  exit: { opacity: 1, transition: { duration: 0 } },
}
