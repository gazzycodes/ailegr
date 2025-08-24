import React from 'react'

type Props = React.SelectHTMLAttributes<HTMLSelectElement> & {
  className?: string
}

export default function ThemedSelect({ className = '', children, ...rest }: Props) {
  return (
    <select
      className={
        'px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none backdrop-blur-md ' +
        'disabled:opacity-50 disabled:cursor-not-allowed ' +
        className
      }
      {...rest}
    >
      {children}
    </select>
  )
}


