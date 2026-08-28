import Link from 'next/link'

const principles = [
  ['01', 'Start with a question', 'Share a problem worth solving, even before you know the answer.'],
  ['02', 'Find your people', 'Bring in researchers, builders, and curious critics at the right moment.'],
  ['03', 'Make progress visible', 'Turn conversations into experiments, projects, and real outcomes.'],
]

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f7f5ef] text-slate-900">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <header className="flex items-center justify-between py-6">
          <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-teal-700 text-lg text-white">i</span>
            <span>innovators</span>
          </Link>
          <nav className="flex items-center gap-3 text-sm font-medium">
            <Link href="/feed" className="hidden rounded-full px-4 py-2 text-slate-600 hover:bg-white sm:block">Explore ideas</Link>
            <Link href="/auth/login" className="rounded-full px-4 py-2 text-slate-700 hover:bg-white">Log in</Link>
            <Link href="/auth/signup" className="rounded-full bg-slate-900 px-4 py-2 text-white shadow-sm transition hover:bg-slate-700">Join the community</Link>
          </nav>
        </header>

        <section className="relative grid min-h-[650px] items-center gap-12 py-16 lg:grid-cols-[1.05fr_.95fr] lg:py-20">
          <div className="absolute -left-24 top-10 -z-0 h-72 w-72 rounded-full bg-amber-200/55 blur-3xl" />
          <div className="relative z-10 max-w-2xl">
            <p className="mb-6 inline-flex rounded-full border border-teal-700/20 bg-teal-50 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-teal-800">A home for useful ideas</p>
            <h1 className="max-w-xl text-5xl font-semibold leading-[.98] tracking-tight sm:text-6xl lg:text-7xl">Build the next thing <em className="font-normal text-teal-700">together.</em></h1>
            <p className="mt-7 max-w-lg text-lg leading-8 text-slate-600">Innovators is a shared workspace for the early, messy, exciting part of making change: asking better questions and finding people who want to help.</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/auth/signup" className="rounded-full bg-teal-700 px-6 py-3.5 text-center text-sm font-semibold text-white shadow-lg shadow-teal-900/15 transition hover:bg-teal-800">Bring an idea</Link>
              <Link href="/feed" className="rounded-full border border-slate-300 bg-white px-6 py-3.5 text-center text-sm font-semibold text-slate-800 transition hover:border-slate-400">Browse the exchange <span aria-hidden>→</span></Link>
            </div>
            <div className="mt-12 flex items-center gap-5 text-sm text-slate-500">
              <div className="flex -space-x-2"><span className="grid h-8 w-8 place-items-center rounded-full border-2 border-[#f7f5ef] bg-amber-400 text-xs font-bold">R</span><span className="grid h-8 w-8 place-items-center rounded-full border-2 border-[#f7f5ef] bg-sky-400 text-xs font-bold">M</span><span className="grid h-8 w-8 place-items-center rounded-full border-2 border-[#f7f5ef] bg-rose-300 text-xs font-bold">J</span></div>
              <span>Made for curious collaborators</span>
            </div>
          </div>

          <div className="relative z-10 mx-auto w-full max-w-md rotate-[-2deg] rounded-[2rem] border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-900/10 lg:mr-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4"><span className="text-xs font-bold uppercase tracking-[.16em] text-slate-400">In the exchange</span><span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">Exploring</span></div>
            <div className="py-6"><div className="mb-4 h-10 w-10 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600" /><p className="text-xs font-semibold text-teal-700">Community health</p><h2 className="mt-2 text-2xl font-semibold leading-tight tracking-tight">How might we make local care easier to navigate?</h2><p className="mt-3 text-sm leading-6 text-slate-500">Looking for researchers and builders to map the confusing moments that patients face.</p></div>
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm"><span className="font-medium text-slate-600">12 people discussing</span><span className="font-semibold text-teal-700">Open idea ↗</span></div>
          </div>
        </section>

        <section className="border-t border-slate-200 py-20">
          <div className="mb-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-bold uppercase tracking-[.16em] text-teal-700">How it works</p><h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">From spark to shared work.</h2></div><p className="max-w-sm text-slate-500">There is no perfect time to begin. There is only a thoughtful first conversation.</p></div>
          <div className="grid gap-4 md:grid-cols-3">{principles.map(([number, title, description]) => <article key={number} className="rounded-3xl border border-slate-200 bg-white p-6"><span className="text-sm font-bold text-amber-600">{number}</span><h3 className="mt-10 text-xl font-semibold">{title}</h3><p className="mt-3 leading-7 text-slate-600">{description}</p></article>)}</div>
        </section>
      </div>
      <footer className="border-t border-slate-200 bg-white py-7"><div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-8"><span>Ideas get better in company.</span><Link href="/admin/login" className="hover:text-teal-700">Admin access</Link></div></footer>
    </main>
  )
}
