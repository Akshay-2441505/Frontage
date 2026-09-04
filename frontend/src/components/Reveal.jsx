import { motion } from 'motion/react'
import { fadeRise, STILL, staggerParent, useMotionOK } from '../lib/motion'

/* Entrance wrapper.

   Nothing in this app should appear without being introduced — before this,
   messages, product cards and outcome panels all popped into existence, which
   is what made a live-updating product feel static. Used in both zones so the
   arrival timing is the same everywhere.

   `stagger` turns it into a parent that introduces its children in sequence;
   children then use <Reveal.Item>. When the visitor has asked for reduced
   motion the variants collapse to their end state, so the markup and layout
   are identical either way — only the travel disappears. */

export default function Reveal({
  as = 'div',
  stagger = null,
  delay = 0,
  inView = false,
  children,
  ...rest
}) {
  const animate = useMotionOK()
  const Tag = motion[as] || motion.div

  const variants = stagger
    ? staggerParent(stagger, delay)
    : animate
      ? fadeRise
      : STILL

  const viewportProps = inView
    ? { whileInView: 'visible', viewport: { once: true, amount: 0.25 } }
    : { animate: 'visible' }

  return (
    <Tag
      initial={animate ? 'hidden' : 'visible'}
      variants={variants}
      transition={delay && !stagger ? { delay } : undefined}
      {...viewportProps}
      {...rest}
    >
      {children}
    </Tag>
  )
}

function Item({ as = 'div', children, ...rest }) {
  const animate = useMotionOK()
  const Tag = motion[as] || motion.div

  return (
    <Tag variants={animate ? fadeRise : STILL} {...rest}>
      {children}
    </Tag>
  )
}

Reveal.Item = Item
