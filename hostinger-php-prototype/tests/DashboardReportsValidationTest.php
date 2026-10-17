<?php

declare(strict_types=1);

require_once __DIR__ . '/../private/bootstrap.php';

function awikDashboardReportTestAssert(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, $message . PHP_EOL);
        exit(1);
    }
}

function awikDashboardReportTestExpectStatus(callable $callback, int $status, string $message): void
{
    try {
        $callback();
    } catch (AwikApiException $exception) {
        awikDashboardReportTestAssert($exception->statusCode === $status, $message . ': wrong status');
        return;
    }
    awikDashboardReportTestAssert(false, $message . ': expected exception');
}

awikDashboardReportTestAssert(function_exists('awikDashboardRouteMatches'), 'dashboard route matcher must exist');
awikDashboardReportTestAssert(function_exists('awikValidateDashboardPeriod'), 'dashboard period validator must exist');
awikDashboardReportTestAssert(function_exists('awikValidateReportDateRange'), 'report date-range validator must exist');
awikDashboardReportTestAssert(function_exists('awikHandleDashboardRequest'), 'dashboard request handler must exist');
awikDashboardReportTestAssert(function_exists('awikHandleReportRequest'), 'report request handler must exist');

$route = awikDashboardRouteMatches('GET', '/api/v1/dashboard/kpis');
awikDashboardReportTestAssert($route !== null && ($route['kind'] ?? null) === 'kpis', 'dashboard KPI route mismatch');

$route = awikDashboardRouteMatches('GET', '/api/v1/dashboard/revenue-chart');
awikDashboardReportTestAssert($route !== null && ($route['kind'] ?? null) === 'revenue-chart', 'dashboard revenue chart route mismatch');

$route = awikDashboardRouteMatches('GET', '/api/v1/dashboard/alerts');
awikDashboardReportTestAssert($route !== null && ($route['kind'] ?? null) === 'alerts', 'dashboard alerts route mismatch');

$reportRoute = awikReportRouteMatches('GET', '/api/v1/reports/revenue');
awikDashboardReportTestAssert($reportRoute !== null && ($reportRoute['kind'] ?? null) === 'revenue', 'report revenue route mismatch');

$downloadRoute = awikReportRouteMatches('GET', '/api/v1/reports/revenue/download');
awikDashboardReportTestAssert($downloadRoute !== null && ($downloadRoute['kind'] ?? null) === 'revenue' && $downloadRoute['download'] === true, 'report download route mismatch');

$csvData = [
    ['saleNumber' => 'S-1', 'customerFirstName' => 'Ada,', 'customerLastName' => 'Customer', 'paymentMethod' => 'cash', 'status' => 'COMPLETED', 'totalAmount' => '12.50', 'createdAt' => '2026-10-13 12:00:00'],
    ['saleNumber' => 'S-2', 'customerFirstName' => 'Zoë', 'customerLastName' => "\"Net\"\r\nNorth", 'paymentMethod' => 'card', 'status' => 'REFUNDED', 'totalAmount' => '1.00', 'createdAt' => '2026-10-12 12:00:00'],
];
$csvContent = awikReportCsvContent('sales', $csvData);
$csvStream = fopen('php://temp', 'r+');
fwrite($csvStream, $csvContent);
rewind($csvStream);
$csvHeader = fgetcsv($csvStream, null, ',', '"', '');
$csvFirstRow = fgetcsv($csvStream, null, ',', '"', '');
$csvSecondRow = fgetcsv($csvStream, null, ',', '"', '');
fclose($csvStream);
awikDashboardReportTestAssert($csvHeader === ['Sale #', 'Customer', 'Method', 'Status', 'Amount', 'Date'], 'sales CSV columns mismatch');
awikDashboardReportTestAssert($csvFirstRow === ['S-1', 'Ada, Customer', 'cash', 'COMPLETED', '12.50', '10/13/2026'], 'sales CSV row projection mismatch');
awikDashboardReportTestAssert($csvSecondRow === ['S-2', "Zoë \"Net\"\r\nNorth", 'card', 'REFUNDED', '1.00', '10/12/2026'], 'Unicode/multiline sales CSV row projection mismatch');

$emptyCsv = awikReportCsvContent('sales', []);
$emptyStream = fopen('php://temp', 'r+');
fwrite($emptyStream, $emptyCsv);
rewind($emptyStream);
awikDashboardReportTestAssert(fgetcsv($emptyStream, null, ',', '"', '') === ['Sale #', 'Customer', 'Method', 'Status', 'Amount', 'Date'], 'empty report CSV schema mismatch');
awikDashboardReportTestAssert(fgetcsv($emptyStream, null, ',', '"', '') === false, 'empty report CSV should not invent a data row');
fclose($emptyStream);

awikDashboardReportTestAssert(
    array_map('awikReportCsvCell', ['=1+1', '+1+1', '-1+1', '@SUM(A1:A2)', "\t=1+1", "\u{00A0}=1+1", "\u{FEFF}=1+1"])
        === ["'=1+1", "'+1+1", "'-1+1", "'@SUM(A1:A2)", "'\t=1+1", "'\u{00A0}=1+1", "'\u{FEFF}=1+1"],
    'CSV formula prefixes were not escaped consistently'
);

$reportHeaders = [
    'revenue' => ['Sale #', 'Customer', 'Method', 'Amount', 'Date'],
    'sales' => ['Sale #', 'Customer', 'Method', 'Status', 'Amount', 'Date'],
    'customers' => ['Name', 'Phone', 'WhatsApp', 'Status', 'Joined'],
    'subscriptions' => ['Status', 'Count'],
    'inventory' => ['Category', 'Item Count', 'Total Stock', 'Value'],
    'stock-movements' => ['Product', 'Type', 'Quantity', 'Prev', 'New', 'User', 'Date'],
    'whatsapp' => ['Phone', 'Status', 'Template', 'Date'],
];
foreach ($reportHeaders as $reportName => $expectedHeaders) {
    [$actualHeaders] = awikReportCsvProjection($reportName, []);
    awikDashboardReportTestAssert($actualHeaders === $expectedHeaders, $reportName . ' CSV headers differ from Nest export');
}

[$revenueHeaders, $revenueRows] = awikReportCsvProjection('revenue', [
    'summary' => ['totalRevenue' => 12.5, 'totalSales' => 1],
    'byMethod' => [['method' => 'cash', 'total' => 12.5, 'count' => 1]],
    'sales' => [[
        'saleNumber' => 'S-3', 'customer' => ['firstName' => '東京', 'lastName' => 'café'],
        'paymentMethod' => 'cash', 'totalAmount' => '12.50', 'createdAt' => '2026-10-11 08:00:00',
    ]],
]);
awikDashboardReportTestAssert($revenueHeaders === $reportHeaders['revenue'], 'revenue CSV schema mismatch');
awikDashboardReportTestAssert($revenueRows === [['S-3', '東京 café', 'cash', '12.50', '10/11/2026']], 'nested revenue customer projection mismatch');

[$customerHeaders, $customerRows] = awikReportCsvProjection('customers', [[
    'firstName' => 'Mina', 'lastName' => 'Lee', 'phone' => '+1', 'whatsappNumber' => null,
    'status' => 'active', 'createdAt' => '2026-01-02 00:00:00',
]]);
awikDashboardReportTestAssert($customerHeaders === $reportHeaders['customers'], 'customer CSV schema mismatch');
awikDashboardReportTestAssert($customerRows === [['Mina Lee', '+1', '-', 'active', '1/2/2026']], 'customer CSV projection mismatch');

[, $subscriptionRows] = awikReportCsvProjection('subscriptions', [
    'summary' => ['totalSubscriptions' => 3, 'totalActive' => 2],
    'byStatus' => [['status' => 'ACTIVE', 'count' => 2], ['status' => 'EXPIRED', 'count' => 1]],
    'byPlan' => [],
]);
awikDashboardReportTestAssert($subscriptionRows === [['ACTIVE', 2], ['EXPIRED', 1]], 'subscription status grouping mismatch');

[, $inventoryRows] = awikReportCsvProjection('inventory', [
    'summary' => ['totalItems' => 3, 'totalQuantity' => 6, 'totalValue' => 55],
    'byCategory' => [
        ['category' => 'Switches', 'count' => 1, 'totalStock' => 1, 'value' => 5],
        ['category' => 'Routers', 'count' => 2, 'totalStock' => 5, 'value' => 50],
    ],
]);
awikDashboardReportTestAssert($inventoryRows === [['Switches', 1, 1, '5.00'], ['Routers', 2, 5, '50.00']], 'inventory aggregate projection mismatch');

[, $movementRows] = awikReportCsvProjection('stock-movements', [[
    'product' => ['name' => 'Router'], 'movementType' => 'PURCHASE', 'quantity' => 2,
    'previousStock' => 1, 'newStock' => 3, 'user' => ['firstName' => 'Sam', 'lastName' => 'Lee'],
    'createdAt' => '2026-02-03 00:00:00',
]]);
awikDashboardReportTestAssert($movementRows === [['Router', 'PURCHASE', 2, 1, 3, 'Sam Lee', '2/3/2026']], 'stock movement nested projection mismatch');

[, $whatsAppRows] = awikReportCsvProjection('whatsapp', [[
    'recipientPhone' => '+1', 'status' => 'delivered', 'templateType' => 'expiry', 'createdAt' => '2026-03-04 00:00:00',
]]);
awikDashboardReportTestAssert($whatsAppRows === [['+1', 'delivered', 'expiry', '3/4/2026']], 'WhatsApp CSV projection mismatch');

$csvResponse = awikReportResponse($downloadRoute, ['format' => 'csv'], ['sales' => $csvData]);
awikDashboardReportTestAssert($csvResponse['statusCode'] === 200, 'CSV download status mismatch');
awikDashboardReportTestAssert($csvResponse['headers']['Content-Type'] === 'text/csv', 'CSV download content type mismatch');
awikDashboardReportTestAssert($csvResponse['headers']['Content-Disposition'] === 'attachment; filename="revenue-report.csv"', 'CSV download filename mismatch');
awikDashboardReportTestAssert($csvResponse['body'] === awikReportCsvContent('revenue', ['sales' => $csvData]), 'CSV response body mismatch');
awikDashboardReportTestAssert(!array_key_exists('payload', $csvResponse), 'Raw CSV response must not receive a JSON payload');

$normalJsonResponse = awikReportResponse($reportRoute, [], ['sales' => $csvData]);
awikDashboardReportTestAssert($normalJsonResponse['statusCode'] === 200, 'Normal report JSON status changed');
awikDashboardReportTestAssert($normalJsonResponse['payload'] === ['success' => true, 'data' => ['sales' => $csvData]], 'Normal report JSON payload changed');
awikDashboardReportTestAssert(!array_key_exists('body', $normalJsonResponse), 'Normal report JSON must not use the raw-body response path');

awikDashboardReportTestAssert(function_exists('awikReportPdfContent'), 'PDF report generator must exist');
awikDashboardReportTestAssert(function_exists('awikReportXlsxContent'), 'Excel report generator must exist');
awikDashboardReportTestAssert(class_exists(ZipArchive::class), 'XLSX content tests require the PHP ZIP extension');

$reportFixtures = [
    'revenue' => [
        'summary' => ['totalRevenue' => 12.5, 'totalSales' => 1],
        'byMethod' => [['method' => 'cash', 'total' => 12.5, 'count' => 1]],
        'sales' => [[
            'saleNumber' => 'S-EXPORT-1', 'customerFirstName' => 'Ada', 'customerLastName' => 'Customer',
            'paymentMethod' => 'cash', 'totalAmount' => '12.50', 'createdAt' => '2026-10-13 12:00:00',
        ]],
    ],
    'sales' => [
        'summary' => ['totalAmount' => 12.5, 'totalCount' => 1],
        'byStatus' => [['status' => 'COMPLETED', 'count' => 1]],
        'sales' => $csvData,
    ],
    'customers' => [
        'summary' => ['totalCustomers' => 1, 'withWhatsapp' => 1],
        'byStatus' => [['status' => 'ACTIVE', 'count' => 1]],
        'recentCustomers' => [[
            'firstName' => 'Ada', 'lastName' => 'Customer', 'phone' => '+155500001',
            'whatsappNumber' => '+155500001', 'status' => 'ACTIVE', 'createdAt' => '2026-10-13 12:00:00',
        ]],
    ],
    'subscriptions' => [
        'summary' => ['totalSubscriptions' => 1, 'totalActive' => 1],
        'byStatus' => [['status' => 'ACTIVE', 'count' => 1]],
        'byPlan' => [],
    ],
    'inventory' => [
        'summary' => ['totalItems' => 1, 'totalQuantity' => 3, 'totalValue' => 6],
        'byCategory' => [['category' => 'Routers', 'count' => 1, 'totalStock' => 3, 'value' => 6]],
    ],
    'stock-movements' => [
        'summary' => ['totalMovements' => 1, 'inbound' => 3, 'outbound' => 0],
        'movements' => [[
            'productName' => 'Router', 'movementType' => 'PURCHASE', 'quantity' => 3,
            'previousStock' => 0, 'newStock' => 3, 'userFirstName' => 'Admin', 'userLastName' => 'User',
            'createdAt' => '2026-10-13 12:00:00',
        ]],
    ],
    'whatsapp' => [
        'summary' => ['totalMessages' => 1, 'delivered' => 1, 'failed' => 0, 'deliveryRate' => 1],
        'messages' => [[
            'recipientPhone' => '+155500002', 'status' => 'delivered',
            'templateType' => 'expiry', 'createdAt' => '2026-10-13 12:00:00',
        ]],
    ],
];

foreach ($reportFixtures as $reportName => $fixture) {
    $route = ['kind' => $reportName, 'download' => true];
    $pdf = awikReportResponse($route, ['format' => 'pdf'], $fixture);
    awikDashboardReportTestAssert($pdf['statusCode'] === 200, $reportName . ' PDF status mismatch');
    awikDashboardReportTestAssert($pdf['headers']['Content-Type'] === 'application/pdf', $reportName . ' PDF MIME mismatch');
    awikDashboardReportTestAssert($pdf['headers']['Content-Disposition'] === 'attachment; filename="' . $reportName . '-report.pdf"', $reportName . ' PDF filename mismatch');
    awikDashboardReportTestAssert(str_starts_with($pdf['body'], "%PDF-1.4\n"), $reportName . ' PDF signature mismatch');
    awikDashboardReportTestAssert(str_contains($pdf['body'], 'xref') && str_ends_with($pdf['body'], "%%EOF\n"), $reportName . ' PDF structure is incomplete');
    awikDashboardReportTestAssert(str_contains($pdf['body'], 'AWIK NET - ' . awikReportTitle($reportName)), $reportName . ' PDF title missing');
    awikDashboardReportTestAssert(!array_key_exists('payload', $pdf), $reportName . ' PDF must use raw binary response');

    $xlsx = awikReportResponse($route, ['format' => 'excel'], $fixture);
    awikDashboardReportTestAssert($xlsx['statusCode'] === 200, $reportName . ' XLSX status mismatch');
    awikDashboardReportTestAssert(
        $xlsx['headers']['Content-Type'] === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        $reportName . ' XLSX MIME mismatch'
    );
    awikDashboardReportTestAssert($xlsx['headers']['Content-Disposition'] === 'attachment; filename="' . $reportName . '-report.xlsx"', $reportName . ' XLSX filename mismatch');
    awikDashboardReportTestAssert(str_starts_with($xlsx['body'], "PK\x03\x04"), $reportName . ' XLSX ZIP signature mismatch');
    awikDashboardReportTestAssert(!array_key_exists('payload', $xlsx), $reportName . ' XLSX must use raw binary response');

    $tempXlsx = tempnam(sys_get_temp_dir(), 'awik-xlsx-test-');
    awikDashboardReportTestAssert(is_string($tempXlsx), 'Could not allocate temporary XLSX verification file');
    try {
        awikDashboardReportTestAssert(file_put_contents($tempXlsx, $xlsx['body']) === strlen($xlsx['body']), 'Could not write generated XLSX fixture');
        $archive = new ZipArchive();
        awikDashboardReportTestAssert($archive->open($tempXlsx) === true, $reportName . ' XLSX is not a readable ZIP archive');
        try {
            $sheet = $archive->getFromName('xl/worksheets/sheet1.xml');
            awikDashboardReportTestAssert(is_string($sheet), $reportName . ' XLSX worksheet is missing');
            foreach (['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml'] as $xmlEntry) {
                $xml = $archive->getFromName($xmlEntry);
                awikDashboardReportTestAssert(
                    is_string($xml) && simplexml_load_string($xml, SimpleXMLElement::class, LIBXML_NONET) !== false,
                    $reportName . ' XLSX contains malformed OOXML part ' . $xmlEntry
                );
            }
            awikDashboardReportTestAssert(str_contains($sheet, htmlspecialchars(awikReportTitle($reportName), ENT_XML1 | ENT_QUOTES, 'UTF-8')), $reportName . ' XLSX title missing');
            awikDashboardReportTestAssert(!str_contains($sheet, '<f>'), $reportName . ' XLSX must write untrusted cells as text, not formulas');
            awikDashboardReportTestAssert(str_contains($sheet, '<is><t xml:space="preserve">'), $reportName . ' XLSX values must be inline text');
            if ($reportName === 'sales') {
                awikDashboardReportTestAssert(str_contains($sheet, 'S-1') && str_contains($sheet, 'Zoë'), 'XLSX did not retain report row values/Unicode');
            }
        } finally {
            $archive->close();
        }
    } finally {
        if (is_file($tempXlsx)) {
            unlink($tempXlsx);
        }
    }

    $emptyPdf = awikReportResponse($route, ['format' => 'pdf'], []);
    $emptyXlsx = awikReportResponse($route, ['format' => 'excel'], []);
    awikDashboardReportTestAssert(str_contains($emptyPdf['body'], 'No data available'), $reportName . ' empty PDF should clearly state no data');
    $emptyPath = tempnam(sys_get_temp_dir(), 'awik-empty-xlsx-');
    awikDashboardReportTestAssert(is_string($emptyPath), 'Could not allocate empty XLSX verification file');
    try {
        file_put_contents($emptyPath, $emptyXlsx['body']);
        $emptyArchive = new ZipArchive();
        awikDashboardReportTestAssert($emptyArchive->open($emptyPath) === true, $reportName . ' empty XLSX is not readable');
        try {
            $emptySheet = $emptyArchive->getFromName('xl/worksheets/sheet1.xml');
            awikDashboardReportTestAssert(is_string($emptySheet) && str_contains($emptySheet, 'No data available'), $reportName . ' empty XLSX should clearly state no data');
        } finally {
            $emptyArchive->close();
        }
    } finally {
        if (is_file($emptyPath)) {
            unlink($emptyPath);
        }
    }
}

$manySales = [];
for ($index = 0; $index < 100; $index++) {
    $manySales[] = [
        'saleNumber' => 'PAGE-' . $index,
        'customerFirstName' => 'Page',
        'customerLastName' => 'Boundary',
        'paymentMethod' => 'cash',
        'status' => 'COMPLETED',
        'totalAmount' => '1.00',
        'createdAt' => '2026-10-14 00:00:00',
    ];
}
$multiPagePdf = awikReportPdfContent('sales', ['sales' => $manySales]);
awikDashboardReportTestAssert(str_contains($multiPagePdf, '/Count 3'), 'PDF report did not paginate a long report');
awikDashboardReportTestAssert(preg_match('/startxref\n([0-9]+)\n%%EOF\n$/', $multiPagePdf, $xrefMatch) === 1, 'PDF startxref trailer is missing');
$xrefOffset = (int) $xrefMatch[1];
awikDashboardReportTestAssert(substr($multiPagePdf, $xrefOffset, 4) === 'xref', 'PDF startxref does not point to its cross-reference table');
awikDashboardReportTestAssert(
    preg_match('/xref\n0 ([0-9]+)\n0000000000 65535 f \n/', $multiPagePdf, $xrefCountMatch) === 1,
    'PDF cross-reference object table is malformed'
);
$pdfObjectCount = (int) $xrefCountMatch[1];
preg_match_all('/(?m)^([0-9]{10}) 00000 n $/', substr($multiPagePdf, $xrefOffset), $xrefEntries);
awikDashboardReportTestAssert(count($xrefEntries[1]) === $pdfObjectCount - 1, 'PDF cross-reference entries do not match the object count');
foreach ($xrefEntries[1] as $objectIndex => $objectOffset) {
    $objectId = $objectIndex + 1;
    awikDashboardReportTestAssert(
        str_starts_with(substr($multiPagePdf, (int) $objectOffset), $objectId . ' 0 obj'),
        'PDF object offset is invalid for object ' . $objectId
    );
}

$defaultResponse = awikReportResponse($downloadRoute, [], ['sales' => $csvData]);
awikDashboardReportTestAssert(
    $defaultResponse['headers']['Content-Type'] === 'application/pdf',
    'Download format must default to PDF when omitted'
);

awikDashboardReportTestExpectStatus(
    static fn () => awikReportResponse($downloadRoute, ['format' => 'csvx'], $csvData),
    400,
    'unknown report format'
);
foreach (['PDF', ' csv '] as $caseSensitiveFormat) {
    awikDashboardReportTestExpectStatus(
        static fn () => awikReportResponse($downloadRoute, ['format' => $caseSensitiveFormat], $csvData),
        400,
        'Nest-compatible format validation: ' . $caseSensitiveFormat
    );
}
awikDashboardReportTestExpectStatus(
    static fn () => awikValidateReportDateRange(['dateFrom' => ' 2026-09-01 ']),
    400,
    'date filter must not trim invalid whitespace'
);

awikDashboardReportTestAssert(awikValidateDashboardPeriod('weekly') === 'weekly', 'weekly dashboard period mismatch');
awikDashboardReportTestAssert(awikValidateDashboardPeriod('monthly') === 'monthly', 'monthly dashboard period mismatch');
awikDashboardReportTestExpectStatus(
    static fn () => awikValidateDashboardPeriod('yearly'),
    400,
    'invalid dashboard period'
);

$dateRange = awikValidateReportDateRange(['dateFrom' => '2026-09-01', 'dateTo' => '2026-09-30']);
awikDashboardReportTestAssert($dateRange['dateFrom'] === '2026-09-01 00:00:00.000', 'dateFrom UTC instant mismatch');
awikDashboardReportTestAssert($dateRange['dateTo'] === '2026-09-30 00:00:00.000', 'dateTo must match Nest midnight upper bound');

$offsetRange = awikValidateReportDateRange([
    'dateFrom' => '2026-09-01T03:00:00+03:00',
    'dateTo' => '2026-09-01T00:00:00Z',
]);
awikDashboardReportTestAssert($offsetRange['dateFrom'] === '2026-09-01 00:00:00.000', 'offset dateFrom was not normalized to UTC');
awikDashboardReportTestAssert($offsetRange['dateTo'] === '2026-09-01 00:00:00.000', 'UTC dateTo instant mismatch');
awikDashboardReportTestAssert(awikValidateReportQuery(['format' => 'csv'])['dateFrom'] === null, 'format should be accepted by the report DTO');

$boundaryRange = awikValidateReportDateRange(['dateFrom' => '2026-09-15', 'dateTo' => '2026-09-15']);
awikDashboardReportTestAssert($boundaryRange['dateFrom'] === '2026-09-15 00:00:00.000', 'single-day dateFrom boundary mismatch');
awikDashboardReportTestAssert($boundaryRange['dateTo'] === '2026-09-15 00:00:00.000', 'single-day dateTo boundary mismatch');

awikDashboardReportTestExpectStatus(
    static fn () => awikValidateReportDateRange(['dateFrom' => '2026-09-30', 'dateTo' => '2026-09-01']),
    400,
    'report date range ordering'
);

awikDashboardReportTestAssert(awikValidateReportDateRange(['dateFrom' => '2026-09-01'])['dateFrom'] === '2026-09-01 00:00:00.000', 'open-ended start date should be allowed');
awikDashboardReportTestAssert(awikValidateReportDateRange(['dateTo' => '2026-09-30'])['dateTo'] === '2026-09-30 00:00:00.000', 'open-ended end date should be allowed');

awikDashboardReportTestExpectStatus(
    static fn () => awikValidateReportDateRange(['dateFrom' => 'invalid', 'dateTo' => '2026-09-30']),
    400,
    'invalid date format'
);

awikDashboardReportTestExpectStatus(
    static fn () => awikValidateReportDateRange(['dateFrom' => '2026-02-30']),
    400,
    'invalid calendar date'
);
awikDashboardReportTestExpectStatus(
    static fn () => awikValidateReportDateRange(['dateFrom' => '']),
    400,
    'empty date string'
);
awikDashboardReportTestExpectStatus(
    static fn () => awikValidateReportQuery(['dateFrom' => '2026-09-01', 'page' => '2']),
    400,
    'unknown report query parameter'
);
awikDashboardReportTestExpectStatus(
    static fn () => awikValidateReportQuery(['format' => ['csv']]),
    400,
    'non-string report format'
);

foreach (['revenue', 'sales', 'stock-movements', 'whatsapp'] as $filteredReport) {
    awikDashboardReportTestAssert(awikReportUsesDateRange($filteredReport), $filteredReport . ' should honor the date range');
}
foreach (['customers', 'subscriptions', 'inventory'] as $unfilteredReport) {
    awikDashboardReportTestAssert(!awikReportUsesDateRange($unfilteredReport), $unfilteredReport . ' should ignore the date range');
}

awikDashboardReportTestAssert(awikReportLocalRowLimit('customers') === 20, 'customer report local bound mismatch');
awikDashboardReportTestAssert(awikReportLocalRowLimit('whatsapp') === 50, 'WhatsApp report limit mismatch');
awikDashboardReportTestAssert(awikReportLocalRowLimit('subscriptions') === null, 'subscription report should aggregate without row materialization');
awikDashboardReportTestAssert(awikReportLocalRowLimit('revenue') === null, 'revenue export must include every matching detail row');
awikDashboardReportTestAssert(awikReportLocalRowLimit('sales') === null, 'sales export must include every matching detail row');
awikDashboardReportTestAssert(awikReportLocalRowLimit('stock-movements') === null, 'stock movement export must include every matching detail row');

echo "AWIK dashboard and report contract tests passed\n";
