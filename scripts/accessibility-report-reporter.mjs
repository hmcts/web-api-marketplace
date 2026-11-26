import fs from 'node:fs';
import path from 'node:path';

const ATTACHMENT = 'Accessibility Test Report';
const PAGE_SUMMARY = /<summary><strong>Page \d+: (FAILED )?(.*?)<\/strong><\/summary>/g;

/**
 * Gathers the accessibility report each test attaches after its axe audits into one page, so every
 * page audited in a run, and any with violations, can be seen without opening each test.
 */
export default class AccessibilityReportReporter {
  constructor(options = {}) {
    this.outputFolder = options.outputFolder ?? 'test-results/accessibility-report';
    this.audits = new Map();
  }

  onTestEnd(test, result) {
    const attachment = result.attachments.find(a => a.name === ATTACHMENT && a.body);
    if (!attachment) {
      return;
    }
    const html = attachment.body
      .toString('utf8')
      .replaceAll('Consolidated Accessibility Report', 'Accessibility Test Report');
    const pages = [...html.matchAll(PAGE_SUMMARY)].map(([, failed, page]) => ({ page, failed: Boolean(failed) }));
    const project = test.parent.project()?.name ?? '';
    // A retry replaces the attempt before it
    this.audits.set(`${project} ${test.id}`, {
      title: test.title,
      file: path.basename(test.location.file),
      project,
      pages,
      html,
    });
  }

  onEnd() {
    if (this.audits.size === 0) {
      return;
    }
    const detailFolder = path.join(this.outputFolder, 'tests');
    fs.mkdirSync(detailFolder, { recursive: true });

    const audits = [...this.audits.values()].sort(
      (a, b) => a.file.localeCompare(b.file) || a.title.localeCompare(b.title) || a.project.localeCompare(b.project)
    );
    const rows = audits.map((audit, index) => {
      const detail = `tests/${index + 1}.html`;
      fs.writeFileSync(path.join(this.outputFolder, detail), audit.html);
      const failed = audit.pages.filter(p => p.failed).length;
      const pages = audit.pages
        .map(p => `<li>${p.failed ? '<strong>FAILED</strong> ' : ''}${escape(p.page)}</li>`)
        .join('');
      return `<tr class="${failed ? 'failed' : 'passed'}">
        <td>${escape(audit.file)}<br>${escape(audit.title)}</td>
        <td>${escape(audit.project)}</td>
        <td><ul>${pages}</ul></td>
        <td>${failed ? `${failed} with violations` : 'No violations'}</td>
        <td><a href="${detail}">Details</a></td>
      </tr>`;
    });

    const pagesAudited = audits.reduce((sum, a) => sum + a.pages.length, 0);
    const pagesFailed = audits.reduce((sum, a) => sum + a.pages.filter(p => p.failed).length, 0);
    const browsers = [...new Set(audits.map(a => a.project))].sort((a, b) => a.localeCompare(b)).join(', ');

    fs.writeFileSync(
      path.join(this.outputFolder, 'index.html'),
      `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Accessibility Test Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 2em; color: #0b0c0c; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border-bottom: 1px solid #b1b4b6; padding: 0.5em; text-align: left; vertical-align: top; }
    ul { margin: 0; padding-left: 1.2em; }
    tr.failed td { background: #f6d7d2; }
    .summary { font-size: 1.2em; }
  </style>
</head>
<body>
  <h1>Accessibility Test Report</h1>
  <p>axe-core against WCAG 2.0, 2.1 and 2.2, levels A and AA.</p>
  <p class="summary">${pagesAudited} page audits in ${audits.length} test runs: <strong>${pagesFailed} with violations</strong>.</p>
  <p>Browsers: ${escape(browsers)}</p>
  <table>
    <thead><tr><th>Test</th><th>Browser</th><th>Pages audited</th><th>Result</th><th>Report</th></tr></thead>
    <tbody>${rows.join('')}</tbody>
  </table>
</body>
</html>
`
    );
    console.log(`[REPORT] Accessibility Test Report: ${path.resolve(this.outputFolder, 'index.html')}`);
  }
}

function escape(value) {
  return String(value).replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}
