import type { Metadata } from 'next';
import { COMPANY } from './company';

export const metadata: Metadata = {
  title: 'About Us | Tawdeeh Technical Services',
  description:
    'Tawdeeh Technical Services LLC (TWTS), Dubai — makers of the Smart Coaching Center Management System.',
};

const FEATURES = [
  { icon: '⏱', title: 'Biometric attendance', text: 'ZKTeco fingerprint devices, auto-sync across devices and real-time check-in / check-out.' },
  { icon: '📲', title: 'Parent alerts', text: 'Instant WhatsApp and Telegram messages to parents when a student arrives or leaves.' },
  { icon: '📢', title: 'Broadcasts', text: 'Send notices (exams, tests, holidays) to the parents of selected classes, now or scheduled.' },
  { icon: '👤', title: 'Students & teachers', text: 'Profiles, classes, subjects, schedules and Excel import.' },
  { icon: '💰', title: 'Fees & accounts', text: 'Fee collection, receipts, discounts, expenses, salaries and profit / loss reports.' },
  { icon: '💻', title: 'Self-service kiosk', text: 'PIN-based check-in / check-out on a touchscreen.' },
];

const SERVICES = [
  'Time & Attendance Systems',
  'Door Access Control (QR code & card)',
  'Video Intercom & Door Stations',
  'Smart Door Locks',
  'Network Infrastructure',
  'IP Telephony (VoIP)',
  'POS Systems',
  'FieldTrack — GPS attendance for field teams',
  'Home Maintenance',
];

const WHY = [
  '15+ years of experience',
  'Dedicated IT experts',
  '5-star rated service',
  'Affordable, tailored support',
  'Home and business clients',
  'Free consultation',
];

export default function AboutPage() {
  return (
    <div className="max-w-5xl">
      <section className="space-y-4">
        <p className="text-sm font-semibold uppercase tracking-wide text-[#1FA6A6]">About us</p>
        <h1 className="text-3xl font-bold text-[#0B1F5C]">{COMPANY.name}</h1>
        <p className="text-gray-700 max-w-3xl leading-relaxed">
          Tawdeeh Technical Services LLC (TWTS) is a Dubai-based technical services company, established in 2010,
          delivering IT support and smart technology solutions across Dubai and the UAE — from access control and
          surveillance to networking and facility maintenance, for homes and businesses alike.
        </p>
        <p className="text-gray-700 max-w-3xl leading-relaxed">
          Building on our long experience with time &amp; attendance systems, we developed the{' '}
          <span className="font-semibold">Smart Coaching Center Management System</span>: one platform for coaching
          centers, tuition academies and schools to run attendance, parents&apos; notifications, fees and daily
          operations.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-bold text-[#0B1F5C]">Smart Coaching Center Management System</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
              <p className="text-2xl" aria-hidden>
                {f.icon}
              </p>
              <p className="mt-2 font-semibold text-gray-800">{f.title}</p>
              <p className="mt-1 text-sm text-gray-600">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10 grid gap-6 md:grid-cols-2">
        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
          <h2 className="text-lg font-bold text-[#0B1F5C]">Our services</h2>
          <ul className="mt-3 space-y-1.5 text-sm text-gray-700">
            {SERVICES.map((s) => (
              <li key={s} className="flex gap-2">
                <span className="text-[#7FC41C]">●</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
          <h2 className="text-lg font-bold text-[#0B1F5C]">Why choose us</h2>
          <ul className="mt-3 space-y-1.5 text-sm text-gray-700">
            {WHY.map((w) => (
              <li key={w} className="flex gap-2">
                <span className="text-[#F5A623]">✔</span>
                {w}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-10 rounded-xl bg-[#0B1F5C] p-6 text-white">
        <h2 className="text-lg font-bold">Get in touch</h2>
        <p className="mt-1 text-blue-100 text-sm">
          For a demo, pricing or support, contact {COMPANY.contactName}.
        </p>
        <p className="mt-1 text-blue-100 text-sm">
          {COMPANY.address} ·{' '}
          <a href={COMPANY.website} target="_blank" rel="noreferrer" className="underline hover:text-white">
            twts-llc.com
          </a>
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <a
            href={COMPANY.whatsappHref}
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2 rounded-lg bg-[#7FC41C] text-[#0B1F5C] font-semibold hover:bg-[#8fd42a]"
          >
            WhatsApp {COMPANY.phone}
          </a>
          <a href={COMPANY.phoneHref} className="px-4 py-2 rounded-lg border border-white/40 hover:bg-white/10">
            Call
          </a>
          <a
            href={`mailto:${COMPANY.email}`}
            className="px-4 py-2 rounded-lg border border-white/40 hover:bg-white/10"
          >
            {COMPANY.email}
          </a>
        </div>
      </section>
    </div>
  );
}
