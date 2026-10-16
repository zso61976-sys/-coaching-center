import type { Metadata } from 'next';
import { COMPANY } from '../about/company';

export const metadata: Metadata = {
  title: 'FAQ | Smart Coaching Center Management System',
  description: 'Answers to common questions about the Smart Coaching Center Management System by TWTS.',
};

const FAQ: { section: string; items: { q: string; a: string }[] }[] = [
  {
    section: 'General',
    items: [
      {
        q: 'What is the Smart Coaching Center Management System?',
        a: 'An online system for coaching centers, tuition academies and schools. It records attendance with fingerprint devices, sends instant messages to parents, and manages students, teachers, classes, fees and reports from one dashboard.',
      },
      {
        q: 'Do I need to install software on my computer?',
        a: 'No. It is cloud hosted and works in any web browser on a computer, tablet or phone. You only need the fingerprint device at your center connected to the internet.',
      },
      {
        q: 'Can I manage more than one branch?',
        a: 'Yes. Each branch or center has its own company code and its data is kept completely separate. Staff accounts can have different roles (Admin, Manager, Staff, Viewer).',
      },
    ],
  },
  {
    section: 'Attendance',
    items: [
      {
        q: 'Which attendance devices are supported?',
        a: 'ZKTeco fingerprint / face devices. Students are enrolled once and their fingerprints are synced automatically to the other devices of the same area.',
      },
      {
        q: 'What if a student forgets to punch or the device is offline?',
        a: 'Punches are stored on the device and uploaded when it is back online. Students can also check in with a PIN on the self-service kiosk.',
      },
    ],
  },
  {
    section: 'Parent notifications',
    items: [
      {
        q: 'How are parents notified?',
        a: 'Parents get a WhatsApp or Telegram message when their child checks in and checks out. Every message is logged, so you can see whether it was delivered.',
      },
      {
        q: 'Which WhatsApp number sends the messages?',
        a: "Your own center's number(s). You link one or more SIMs by scanning a QR code, the same way as WhatsApp Web. Parents are divided evenly between the SIMs and each parent always hears from the same number, both for attendance and broadcasts.",
      },
      {
        q: 'What happens if one SIM goes offline?',
        a: 'Messages for that SIM are sent from a connected backup SIM (or another linked SIM), so parents still receive them. Keep the phones switched on and connected to the internet, and open WhatsApp on them regularly so they stay linked.',
      },
      {
        q: 'Can my WhatsApp number be blocked?',
        a: 'The system links your number like WhatsApp Web, which is not the official WhatsApp Business API, so there is always some risk if many parents report the number. To keep it low, messages go out slowly with varied wording, parents first receive a welcome message asking them to save the number, and you can add backup SIMs. Use SIMs that are a few months old and avoid links in broadcasts.',
      },
    ],
  },
  {
    section: 'Broadcasts',
    items: [
      {
        q: 'What is a broadcast?',
        a: 'A notice (exam, test, holiday, fee reminder…) sent to the parents of the classes you select. The parent’s and child’s names are added automatically, and parents who share a number get it only once.',
      },
      {
        q: 'When does a broadcast start?',
        a: 'Immediately when you click Send, or at the date and time you choose with “Schedule for later”. A scheduled broadcast can be stopped before it starts.',
      },
      {
        q: 'Why does a broadcast take time to finish?',
        a: 'To protect your WhatsApp numbers, one message goes out about every 2 minutes (150 parents ≈ 5 hours). Attendance messages always go first, so check-in alerts are never delayed by a broadcast.',
      },
    ],
  },
  {
    section: 'Fees, data & support',
    items: [
      {
        q: 'Can I manage fees and expenses?',
        a: 'Yes. Collect fees, print receipts, give discounts, record expenses and salaries, and see monthly profit / loss reports.',
      },
      {
        q: 'Is my data safe?',
        a: 'Each center’s data is isolated and only users you create can log in. Data is kept on our secure server.',
      },
      {
        q: 'How do I get a demo, pricing or support?',
        a: `Contact ${COMPANY.contactName} on WhatsApp or phone ${COMPANY.phone}, or email ${COMPANY.email}. Consultation is free.`,
      },
    ],
  },
];

export default function FaqPage() {
  return (
    <div className="max-w-5xl">
      <p className="text-sm font-semibold uppercase tracking-wide text-[#1FA6A6]">Help</p>
      <h1 className="text-3xl font-bold text-[#0B1F5C]">Frequently asked questions</h1>
      <p className="mt-2 text-gray-600">Smart Coaching Center Management System</p>

      <div className="mt-8 space-y-8">
        {FAQ.map((group) => (
          <section key={group.section}>
            <h2 className="text-lg font-bold text-[#0B1F5C]">{group.section}</h2>
            <div className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white shadow-sm">
              {group.items.map((item) => (
                <details key={item.q} className="group p-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-gray-800">
                    {item.q}
                    <span className="text-[#1FA6A6] transition-transform group-open:rotate-45 text-xl leading-none">
                      +
                    </span>
                  </summary>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">{item.a}</p>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-10 rounded-xl bg-white p-6 shadow-sm border border-gray-100 text-sm text-gray-700">
        Still have a question?{' '}
        <a href={COMPANY.whatsappHref} target="_blank" rel="noreferrer" className="font-semibold text-[#0B1F5C] underline">
          Message us on WhatsApp
        </a>{' '}
        or email{' '}
        <a href={`mailto:${COMPANY.email}`} className="font-semibold text-[#0B1F5C] underline">
          {COMPANY.email}
        </a>
        .
      </div>
    </div>
  );
}
