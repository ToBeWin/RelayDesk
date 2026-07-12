export function BrandSymbol({ title = "RelayDesk" }: { title?: string }) {
  return <svg className="brand-symbol" viewBox="0 0 32 32" role="img" aria-label={title} fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 26V6H15.6C20.5 6 23.5 8.8 23.5 13.4C23.5 16.2 22.4 18.5 20 20L26 26" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M6 16H18.5" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" />
    <path d="M16 12.4L20 16L16 19.6" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}
