import { Converter } from 'opencc-js'

// The service translates response labels; tag writes must use the same stable key.
const toTraditional = Converter({ from: 'cn', to: 'tw' })
export const accountTextKey = (text: string): string => toTraditional(text)
