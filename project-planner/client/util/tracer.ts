import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

import { BatchSpanProcessor, WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { resourceFromAttributes } from '@opentelemetry/resources';

// import { DDPSpanExporter } from "./ddp-otlp-client";
// import './instrument/ddp-client'

import { SpanExporter, ReadableSpan } from '@opentelemetry/sdk-trace-web';
import { ExportResultCode, type ExportResult } from "@opentelemetry/core";
import { JsonTraceSerializer } from '@opentelemetry/otlp-transformer';
import { context, type HrTime } from "@opentelemetry/api";
import { suppressTracing } from "@opentelemetry/core";
// import { server } from "./ddp";
// import { discoverClockOffset } from "./clock-sync-client";

export const resource = resourceFromAttributes({
  'session.host': document.location.host,
  'session.id': crypto.randomUUID(),
  'browser.languages': [...navigator.languages],
  // 'service.version': Meteor.gitCommitHash,
  // vvv https://opentelemetry.io/docs/reference/specification/resource/semantic_conventions/browser/
  'browser.brands': navigator.userAgentData?.brands?.map(x => `${x.brand} ${x.version}`) ?? [],
  'browser.platform': navigator.userAgentData?.platform,
  'browser.mobile': navigator.userAgentData?.mobile,
  'browser.language': navigator.language,
  'user_agent.original': navigator.userAgent,
});

export class DDPSpanExporter implements SpanExporter {
  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    context.with(suppressTracing(context.active()), async () => {
      // const clockOffset = Meteor.connection.status().connected
      //   ? await discoverClockOffset()
      //     .catch(err => {
      //       console.log('clock offset discovery failed:', err.message);
      //       return 0;
      //     })
      //   : 0;
      const clockOffset = 0;

      for (const span of spans) {
        // @ts-expect-error writing readonly property.
        span.startTime = sumMillisWithHrTime(clockOffset, span.startTime);
        // @ts-expect-error writing readonly property.
        span.endTime = sumMillisWithHrTime(clockOffset, span.endTime);
        for (const event of span.events) {
          event.time = sumMillisWithHrTime(clockOffset, event.time);
        }
      }
      // const shiftedSpans = spans.map<ReadableSpan>(span => ({
      //   ...span,
      //   startTime: sumMillisWithHrTime(clockOffset, span.startTime),
      //   endTime: sumMillisWithHrTime(clockOffset, span.endTime),
      //   events: span.events.map(event => ({
      //     ...event,
      //     time: sumMillisWithHrTime(clockOffset, event.time),
      //   })),
      // }));

      const req = JsonTraceSerializer.serializeRequest(spans);

      const { server } = await import("../../_meteor-compat/client/app");
      await server.callMethod('OTLP/v1/traces', [req])
        .then<ExportResult,ExportResult>(
          () => ({ code: ExportResultCode.SUCCESS }),
          err => ({ code: ExportResultCode.FAILED, error: err }))
        .then(resultCallback);
    });
  }
  async shutdown(): Promise<void> {}
}

// I don't really like this, only minimally tested..
function sumMillisWithHrTime(millis: number, time: HrTime): HrTime {
  if (millis == 0) return time;
  if (millis > 0) {
    const fullNanos = time[1] + (millis * 1_000_000);
    const justNanos = fullNanos % 1_000_000_000;
    const extraSeconds = (fullNanos - justNanos) / 1_000_000_000;
    return [time[0] + extraSeconds, justNanos];
  } else {
    const fullNanos = time[1] + (millis * 1_000_000);
    const secondsBehind = Math.ceil(-fullNanos / 1_000_000_000);
    const remainingNanos = fullNanos + (secondsBehind * 1_000_000_000);
    return [time[0] - secondsBehind, remainingNanos];
  }
}


export const tracer = new WebTracerProvider({
  resource,
  spanProcessors: [
    new BatchSpanProcessor(new DDPSpanExporter()),
  ],
});
tracer.register();
