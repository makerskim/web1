import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { motion } from 'motion/react';
import s from './Button.module.css';

type Variant = 'primary' | 'secondary' | 'plain' | 'danger';
export function Button({ variant = 'primary', size = 'md', block = false, children, className = '', ...rest }: {
  variant?: Variant; size?: 'sm' | 'md' | 'lg'; block?: boolean; children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <motion.button whileTap={{ scale: 0.97 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className={`${s.btn} ${s[variant]} ${s[size]} ${block ? s.block : ''} ${className}`} {...(rest as any)}>
      {children}
    </motion.button>
  );
}
