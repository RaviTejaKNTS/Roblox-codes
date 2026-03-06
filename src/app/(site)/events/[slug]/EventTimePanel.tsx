import { EventCountdown } from "./EventCountdown";
import { LocalTimeWidget } from "./LocalTimeWidget";
import { buildCountdown, formatDateTimeLabel, formatDuration, formatInZone } from "./eventTimeFormat";

type TimeZoneRow = {
  label: string;
  timeZone: string;
};

const TIME_ZONES: TimeZoneRow[] = [
  { label: "United States – PT", timeZone: "America/Los_Angeles" },
  { label: "United States – ET", timeZone: "America/New_York" },
  { label: "Brazil – BRT", timeZone: "America/Sao_Paulo" },
  { label: "United Kingdom – GMT", timeZone: "Europe/London" },
  { label: "Europe – CET", timeZone: "Europe/Paris" },
  { label: "Russia – MSK", timeZone: "Europe/Moscow" },
  { label: "India – IST", timeZone: "Asia/Kolkata" },
  { label: "Philippines – PHT", timeZone: "Asia/Manila" },
  { label: "China – CST", timeZone: "Asia/Shanghai" },
  { label: "South Africa – SAST", timeZone: "Africa/Johannesburg" },
  { label: "Indonesia – WIB", timeZone: "Asia/Jakarta" },
  { label: "Australia – AEDT", timeZone: "Australia/Sydney" },
  { label: "New Zealand – NZDT", timeZone: "Pacific/Auckland" },
  { label: "Japan – JST", timeZone: "Asia/Tokyo" }
];

const PT_TIME_ZONE = "America/Los_Angeles";

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function EventTimePanel({
  startUtc,
  endUtc,
  eventName,
  thumbnailUrl
}: {
  startUtc: string | null;
  endUtc?: string | null;
  eventName: string;
  thumbnailUrl?: string | null;
}) {
  const startDate = parseDate(startUtc);
  const endDate = parseDate(endUtc);

  if (!startDate) {
    return (
      <div className="rounded-2xl border border-dashed border-border/70 bg-surface-muted/60 p-4 md-copy-scope">
        <p data-md-copy="true" className="md-copy-node md-copy-p">Start time not announced yet.</p>
      </div>
    );
  }

  const ptStartLabel = formatDateTimeLabel(startDate, PT_TIME_ZONE);
  const ptEndLabel = endDate ? formatDateTimeLabel(endDate, PT_TIME_ZONE) : null;
  const durationLabel = endDate ? formatDuration(endDate.getTime() - startDate.getTime()) : null;
  const startVerb = startDate.getTime() > Date.now() ? "starts" : "started";
  const durationSentence =
    durationLabel && ptEndLabel ? ` It runs for ${durationLabel} and ends on ${ptEndLabel} PT.` : "";
  const timeZoneRows = TIME_ZONES.map((zone) => ({
    label: zone.label,
    time: formatInZone(startDate, zone.timeZone)
  }));
  const initialCountdown = buildCountdown(startDate.getTime(), Date.now());

  return (
    <div className="space-y-4 md-copy-scope">
      <p data-md-copy="true" className="md-copy-node md-copy-p">
          The event {startVerb} on <time dateTime={startDate.toISOString()}>{ptStartLabel} PT</time>.{durationSentence}
      </p>
      <LocalTimeWidget startUtc={startUtc} endUtc={endUtc} />
      <div className="space-y-3">
        <p data-md-copy="true" className="md-copy-node md-copy-p">Use this countdown to track exactly when the event begins.</p>
        <EventCountdown
          startUtc={startUtc}
          thumbnailUrl={thumbnailUrl}
          eventName={eventName}
          initialLabel={initialCountdown}
        />
      </div>
      <p data-md-copy="true" className="md-copy-node md-copy-p">And here's the {eventName} update release date and time for select regions:</p>
      <div className="table-scroll-wrapper">
        <div className="table-scroll-inner game-copy">
          <table>
            <thead>
              <tr>
                <th className="table-col-compact">Region</th>
                <th>Local time</th>
              </tr>
            </thead>
            <tbody>
              {timeZoneRows.map((row) => (
                <tr key={row.label}>
                  <td className="table-col-compact font-semibold text-foreground">{row.label}</td>
                  <td>{row.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
