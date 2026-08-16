import { openDatabaseWithNetworkReportExcluded } from './db.provider';

type ProcessReportWithNetworkControl = typeof process.report & {
  excludeNetwork: boolean;
};

describe('openDatabaseWithNetworkReportExcluded', () => {
  const diagnosticReport = process.report as ProcessReportWithNetworkControl;
  const originalExcludeNetwork = diagnosticReport.excludeNetwork;

  afterEach(() => {
    diagnosticReport.excludeNetwork = originalExcludeNetwork;
  });

  it('excludes network data during construction and restores false', () => {
    diagnosticReport.excludeNetwork = false;
    const database = {} as ReturnType<typeof openDatabaseWithNetworkReportExcluded>;
    const createDatabase = jest.fn(() => {
      expect(diagnosticReport.excludeNetwork).toBe(true);
      return database;
    });

    const result = openDatabaseWithNetworkReportExcluded('/tmp/devchain.db', createDatabase);

    expect(result).toBe(database);
    expect(createDatabase).toHaveBeenCalledWith('/tmp/devchain.db');
    expect(diagnosticReport.excludeNetwork).toBe(false);
  });

  it('preserves an existing true value', () => {
    diagnosticReport.excludeNetwork = true;
    const database = {} as ReturnType<typeof openDatabaseWithNetworkReportExcluded>;

    openDatabaseWithNetworkReportExcluded('/tmp/devchain.db', () => database);

    expect(diagnosticReport.excludeNetwork).toBe(true);
  });

  it('restores the prior value when construction fails', () => {
    diagnosticReport.excludeNetwork = false;
    const constructionError = new Error('database construction failed');

    expect(() =>
      openDatabaseWithNetworkReportExcluded('/tmp/devchain.db', () => {
        expect(diagnosticReport.excludeNetwork).toBe(true);
        throw constructionError;
      }),
    ).toThrow(constructionError);
    expect(diagnosticReport.excludeNetwork).toBe(false);
  });
});
