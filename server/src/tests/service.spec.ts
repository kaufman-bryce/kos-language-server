import { DocumentService } from '../services/documentService';
import {
  TextDocumentItem,
  Location,
  Range,
  TextDocument,
  VersionedTextDocumentIdentifier,
  Position,
  TextDocumentIdentifier,
  FoldingRange,
  Diagnostic,
  DiagnosticSeverity,
} from 'vscode-languageserver';
import { mockLogger, mockTracer } from '../utilities/logger';
import { URI } from 'vscode-uri';
import { empty } from '../utilities/typeGuards';
import { zip } from '../utilities/arrayUtils';
import { basename, join } from 'path';
import { Scanner } from '../scanner/scanner';
import { Parser } from '../parser/parser';
import { Tokenized } from '../scanner/types';
import { Ast } from '../parser/types';
import { FoldableService } from '../services/foldableService';
import {
  createMockDocConnection,
  createMockUriResponse as createMockIoService,
  createMockDocumentService,
} from './utilities/mockServices';
import { rangeEqual } from '../utilities/positionUtils';
import { AnalysisService } from '../services/analysisService';
import { typeInitializer } from '../typeChecker/initialize';
import { ResolverService } from '../services/resolverService';

typeInitializer();

describe('path resolver', () => {
  test('path resolver', () => {
    const pathResolver = new ResolverService();
    const range = {
      start: {
        line: 0,
        character: 0,
      },
      end: {
        line: 0,
        character: 1,
      },
    };

    const otherFileLocation: Location = {
      range,
      uri: 'file:///root/example/otherFile.ks',
    };

    const otherDirLocation: Location = {
      range,
      uri: 'file:///root/example/up/upFile.ks',
    };

    const relative1 = ['relative', 'path', 'file.ks'].join('/');
    const relative2 = ['..', 'relative', 'path', 'file.ks'].join('/');
    const absolute = ['0:', 'relative', 'path', 'file.ks'].join('/');
    const weird = ['0:relative', 'path', 'file.ks'].join('/');

    expect(pathResolver.resolve(otherFileLocation, relative1)).toBeUndefined();
    expect(pathResolver.resolve(otherDirLocation, relative2)).toBeUndefined();
    expect(pathResolver.resolve(otherFileLocation, absolute)).toBeUndefined();
    expect(pathResolver.resolve(otherFileLocation, weird)).toBeUndefined();

    pathResolver.volume0Uri = URI.file(join('root', 'example'));

    const resolvedUri = 'file:///root/example/relative/path/file.ks';

    const relativeResolved1 = pathResolver.resolve(
      otherFileLocation,
      relative1,
    );
    expect(undefined).not.toBe(relativeResolved1);
    if (!empty(relativeResolved1)) {
      expect(relativeResolved1.toString()).toBe(resolvedUri);
    }

    const relativeResolved2 = pathResolver.resolve(otherDirLocation, relative2);
    expect(undefined).not.toBe(relativeResolved2);
    if (!empty(relativeResolved2)) {
      expect(relativeResolved2.toString()).toBe(resolvedUri);
    }

    const absoluteResolved = pathResolver.resolve(otherFileLocation, absolute);
    expect(undefined).not.toBe(absoluteResolved);
    if (!empty(absoluteResolved)) {
      expect(absoluteResolved.toString()).toBe(resolvedUri);
    }

    const weirdResolved = pathResolver.resolve(otherFileLocation, weird);
    expect(undefined).not.toBe(weirdResolved);
    if (!empty(weirdResolved)) {
      expect(weirdResolved.toString()).toBe(resolvedUri);
    }
  });

  test('path resolver boot', () => {
    const pathResolver = new ResolverService();
    const range = {
      start: {
        line: 0,
        character: 0,
      },
      end: {
        line: 0,
        character: 1,
      },
    };

    const bootFileLocation: Location = {
      range,
      uri: 'file:///root/example/boot/otherFile.ks',
    };

    const relative1 = ['relative', 'path', 'file.ks'].join('/');
    const absolute = ['0:', 'relative', 'path', 'file.ks'].join('/');
    const weird = ['0:relative', 'path', 'file.ks'].join('/');

    expect(pathResolver.resolve(bootFileLocation, relative1)).toBeUndefined();
    expect(pathResolver.resolve(bootFileLocation, absolute)).toBeUndefined();
    expect(pathResolver.resolve(bootFileLocation, weird)).toBeUndefined();

    pathResolver.volume0Uri = URI.file(join('root', 'example'));

    const resolvedUri = 'file:///root/example/relative/path/file.ks';

    const relativeResolved1 = pathResolver.resolve(bootFileLocation, relative1);
    expect(relativeResolved1).toBeDefined();
    if (!empty(relativeResolved1)) {
      expect(relativeResolved1.toString()).toBe(resolvedUri);
    }

    const absoluteResolved = pathResolver.resolve(bootFileLocation, absolute);
    expect(absoluteResolved).toBeDefined();
    if (!empty(absoluteResolved)) {
      expect(absoluteResolved.toString()).toBe(resolvedUri);
    }

    const weirdResolved = pathResolver.resolve(bootFileLocation, weird);
    expect(weirdResolved).toBeDefined();
    if (!empty(weirdResolved)) {
      expect(weirdResolved.toString()).toBe(resolvedUri);
    }
  });
});

describe('documentService', () => {
  test('ready', async () => {
    const mockConnection = createMockDocConnection();
    const files = new Map();
    const mockIoService = createMockIoService(files);

    const baseUri = URI.file('/example/folder');
    const callingUri = URI.file('/example/folder/example.ks').toString();

    const resolverService = new ResolverService();
    const docService = new DocumentService(
      mockConnection,
      mockIoService,
      resolverService,
      mockLogger,
      mockTracer,
    );

    const documentLoaded = await docService.loadDocumentFromScript(
      {
        uri: callingUri,
        range: {
          start: {
            line: 0,
            character: 0,
          },
          end: {
            line: 1,
            character: 0,
          },
        },
      },
      callingUri,
    );

    debugger;
    expect(docService.ready()).toBe(false);
    expect(documentLoaded).toBeUndefined();

    resolverService.volume0Uri = baseUri;
    expect(docService.ready()).toBe(true);
  });

  test('load from client', () => {
    const mockConnection = createMockDocConnection();
    const files = new Map();
    const mockIoService = createMockIoService(files);
    const resolverService = new ResolverService();

    const docService = new DocumentService(
      mockConnection,
      mockIoService,
      resolverService,
      mockLogger,
      mockTracer,
    );

    const serverDocs = docService['serverDocs'];
    const clientDocs = docService['clientDocs'];

    let i = 0;

    const uris = [
      URI.file('/example/doc1.ks'),
      URI.file('/example/doc2.ks'),
      URI.file('/example/doc3.ks'),
      URI.file('/example/doc4.ks'),
    ];

    const docs = ['example 1', 'example 2', 'example 3', 'example 4'];

    docService.onChange(document => {
      expect(document.uri).toBe(uris[i].toString());
      expect(document.text).toBe(docs[i]);
    });

    for (i = 0; i < uris.length; i += 1) {
      mockConnection.callOpen({
        textDocument: TextDocumentItem.create(
          uris[i].toString(),
          'kos',
          1,
          docs[i],
        ),
      });

      expect(serverDocs.size).toBe(0);
      expect(clientDocs.size).toBe(i + 1);

      for (let j = 0; j <= i; j += 1) {
        const doc = docService.getDocument(uris[j].toString());
        expect(doc).toBeDefined();

        if (!empty(doc)) {
          expect(doc.getText()).toBe(docs[j]);
        }

        expect(clientDocs.has(uris[j].toString())).toBe(true);
      }
    }

    const documents = docService.getAllDocuments();
    for (const document of documents) {
      let found = false;
      for (const [uri, doc] of zip(uris, docs)) {
        if (uri.toString() === document.uri && doc === document.getText()) {
          found = true;
        }
      }

      expect(found).toBe(true);
    }
  });

  test('load from server using kOS run', async () => {
    const mockConnection = createMockDocConnection();
    const files = new Map();
    const mockIoService = createMockIoService(files);

    const baseUri = URI.file('/example/folder').toString();
    const callingUri = URI.file('/example/folder/example.ks').toString();

    const resolverService = new ResolverService(baseUri);

    const docService = new DocumentService(
      mockConnection,
      mockIoService,
      resolverService,
      mockLogger,
      mockTracer,
    );

    const serverDocs = docService['serverDocs'];
    const clientDocs = docService['clientDocs'];

    const uris = [
      URI.file('/example/folder/doc1.ks'),
      URI.file('/example/folder/doc2.ks'),
      URI.file('/example/folder/doc3.ks'),
      URI.file('/example/folder/doc4.ks'),
    ];

    const docs = ['example 1', 'example 2', 'example 3', 'example 4'];

    let i = 0;
    for (const [uri, doc] of zip(uris, docs)) {
      const uriString = uri.toString();
      files.set(uri.fsPath, doc);

      const loadedDoc = await docService.loadDocumentFromScript(
        Location.create(
          callingUri,
          Range.create({ line: 0, character: 0 }, { line: 0, character: 10 }),
        ),
        `0:/${basename(uriString)}`,
      );

      expect(loadedDoc).toBeDefined();
      if (!empty(loadedDoc)) {
        expect(TextDocument.is(loadedDoc)).toBe(true);
        expect((loadedDoc as TextDocument).getText()).toBe(doc);
      }

      expect(clientDocs.size).toBe(0);
      expect(serverDocs.size).toBe(i + 1);
      expect(serverDocs.has(uri.toString())).toBe(true);

      for (let j = 0; j <= i; j += 1) {
        const doc = docService.getDocument(uris[j].toString());
        expect(doc).toBeDefined();

        if (!empty(doc)) {
          expect(doc.getText()).toBe(docs[j]);
        }

        expect(serverDocs.has(uris[j].toString())).toBe(true);
      }

      i = i + 1;
    }

    const nonExistentUri = [
      URI.file('/example/folder/none1.ks'),
      URI.file('/example/folder/none2.ks'),
    ];

    for (const uri of nonExistentUri) {
      const uriString = uri.toString();
      const loadedDoc = await docService.loadDocumentFromScript(
        Location.create(
          callingUri,
          Range.create({ line: 0, character: 0 }, { line: 0, character: 10 }),
        ),
        `0:/${basename(uriString)}`,
      );
      expect(loadedDoc).toBeDefined();
      expect(Diagnostic.is(loadedDoc)).toBe(true);

      if (Diagnostic.is(loadedDoc)) {
        expect(loadedDoc.severity).toBe(DiagnosticSeverity.Information);
        expect(
          rangeEqual(
            loadedDoc.range,
            Range.create({ line: 0, character: 0 }, { line: 0, character: 10 }),
          ),
        ).toBe(true);
      }
    }
  });

  test('load from server using uri', async () => {
    const mockConnection = createMockDocConnection();
    const files = new Map();
    const mockIoResponse = createMockIoService(files);

    const baseUri = URI.file('/example/folder').toString();
    const resolverService = new ResolverService(baseUri);

    const docService = new DocumentService(
      mockConnection,
      mockIoResponse,
      resolverService,
      mockLogger,
      mockTracer,
    );

    const serverDocs = docService['serverDocs'];
    const clientDocs = docService['clientDocs'];

    const uris = [
      URI.file('/example/folder/doc1.ks'),
      URI.file('/example/folder/doc2.ks'),
      URI.file('/example/folder/doc3.ks'),
      URI.file('/example/folder/doc4.ks'),
    ];

    const docs = ['example 1', 'example 2', 'example 3', 'example 4'];

    let i = 0;
    for (const [uri, doc] of zip(uris, docs)) {
      const uriString = uri.toString();
      files.set(uri.fsPath, doc);

      const loadedDoc = await docService.loadDocument(uriString);

      expect(loadedDoc).toBeDefined();
      if (!empty(loadedDoc)) {
        expect(TextDocument.is(loadedDoc)).toBe(true);
        expect((loadedDoc as TextDocument).getText()).toBe(doc);
      }

      expect(clientDocs.size).toBe(0);
      expect(serverDocs.size).toBe(i + 1);
      expect(serverDocs.has(uri.toString())).toBe(true);

      for (let j = 0; j <= i; j += 1) {
        const doc = docService.getDocument(uris[j].toString());
        expect(doc).toBeDefined();

        if (!empty(doc)) {
          expect(doc.getText()).toBe(docs[j]);
        }

        expect(serverDocs.has(uris[j].toString())).toBe(true);
      }

      i = i + 1;
    }

    const nonExistentUri = [
      URI.file('/example/folder/none1.ks'),
      URI.file('/example/folder/none2.ks'),
    ];

    for (const uri of nonExistentUri) {
      const uriString = uri.toString();
      const loadedDoc = await docService.loadDocument(uriString);
      expect(loadedDoc).toBeUndefined();
    }
  });

  test('change update', async () => {
    const mockConnection = createMockDocConnection();
    const files = new Map();
    const mockIoService = createMockIoService(files);

    const baseUri = URI.file('/example/folder').toString();
    const resolverService = new ResolverService(baseUri);

    const docService = new DocumentService(
      mockConnection,
      mockIoService,
      resolverService,
      mockLogger,
      mockTracer,
    );

    const serverDocs = docService['serverDocs'];
    const clientDocs = docService['clientDocs'];

    const uri = URI.file('/example/folder/doc1.ks');
    const content = 'example';
    const afterEdit = 'example edited';

    let first = true;

    docService.onChange(document => {
      if (first) {
        expect(document.uri).toBe(uri.toString());
        expect(document.text).toBe(content);
        first = false;
      } else {
        expect(document.uri).toBe(uri.toString());
        expect(document.text).toBe(afterEdit);
      }
    });

    docService.onClose(closeUri => {
      expect(closeUri).toBe(uri.toString());
    });

    mockConnection.callOpen({
      textDocument: TextDocumentItem.create(uri.toString(), 'kos', 1, content),
    });

    expect(serverDocs.size).toBe(0);
    expect(clientDocs.size).toBe(1);

    let clientDoc = docService.getDocument(uri.toString());
    expect(clientDoc).toBeDefined();
    if (!empty(clientDoc)) {
      expect(clientDoc.getText()).toBe(content);
    }

    mockConnection.callChange({
      textDocument: VersionedTextDocumentIdentifier.create(uri.toString(), 1),
      contentChanges: [
        {
          range: Range.create(Position.create(0, 7), Position.create(0, 7)),
          rangeLength: 0,
          text: ' edited',
        },
      ],
    });

    expect(serverDocs.size).toBe(0);
    expect(clientDocs.size).toBe(1);

    clientDoc = docService.getDocument(uri.toString());
    expect(clientDoc).toBeDefined();
    if (!empty(clientDoc)) {
      expect(clientDoc.getText()).toBe(afterEdit);
    }

    mockConnection.callClose({
      textDocument: TextDocumentIdentifier.create(uri.toString()),
    });

    expect(serverDocs.size).toBe(1);
    expect(clientDocs.size).toBe(0);

    clientDoc = docService.getDocument(uri.toString());
    expect(clientDoc).toBeDefined();
    if (!empty(clientDoc)) {
      expect(clientDoc.getText()).toBe(afterEdit);
    }
  });

  test('load extension', async () => {
    const mockConnection = createMockDocConnection();
    const files = new Map();
    const mockUriResponse = createMockIoService(files);

    const baseUri = URI.file('/example/folder').toString();
    const callingUri = URI.file('/example/folder/example.ks').toString();
    const resolverService = new ResolverService(baseUri);

    const docService = new DocumentService(
      mockConnection,
      mockUriResponse,
      resolverService,
      mockLogger,
      mockTracer,
    );

    const serverDocs = docService['serverDocs'];
    const clientDocs = docService['clientDocs'];

    const actualUri = [
      URI.file('/example/folder/doc1.ks'),
      URI.file('/example/folder/doc2.ks'),
      URI.file('/example/folder/doc3.ks'),
    ];

    const requestedUri = [
      URI.file('/example/folder/doc1.ks'),
      URI.file('/example/folder/doc2.ksm'),
      URI.file('/example/folder/doc3'),
      URI.file('/example/folder/doc4.txt'),
    ];

    const doc = 'example';

    let i = 0;
    for (const [aUri, rUri] of zip(actualUri, requestedUri)) {
      const uriString = rUri.toString();
      files.set(aUri.fsPath, doc);

      const loadedDoc = await docService.loadDocumentFromScript(
        Location.create(
          callingUri,
          Range.create({ line: 0, character: 0 }, { line: 0, character: 10 }),
        ),
        `0:/${basename(uriString)}`,
      );

      expect(loadedDoc).toBeDefined();
      if (!empty(loadedDoc)) {
        expect(TextDocument.is(loadedDoc)).toBe(true);
        expect((loadedDoc as TextDocument).getText()).toBe(doc);
      }

      expect(clientDocs.size).toBe(0);
      expect(serverDocs.size).toBe(i + 1);

      expect(serverDocs.has(aUri.toString())).toBe(true);
      i += 1;
    }
  });
});

describe('analysisService', () => {
  test('validate single document', async () => {
    const uri = URI.file('/example/folder/example.ks').toString();

    const documents = new Map([
      [uri, TextDocument.create(uri, 'kos', 1.0, 'print(10).')],
    ]);
    const docService = createMockDocumentService(
      documents,
      URI.file('/').toString(),
    );

    const analysisService = new AnalysisService(
      CaseKind.camelCase,
      mockLogger,
      mockTracer,
      docService,
    );

    const diagnostics = await analysisService.validateDocument(
      uri,
      (documents.get(uri) as TextDocument).getText(),
    );
    const documentInfo = await analysisService.getInfo(uri);

    expect(diagnostics.length).toBe(0);
    expect(documentInfo).toBeDefined();

    if (!empty(documentInfo)) {
      expect(documentInfo.symbolTable.dependencyTables.size).toBe(2);
      expect(documentInfo.diagnostics).toStrictEqual(diagnostics);
      expect(documentInfo.script.stmts.length).toBe(1);
      expect(
        documentInfo.symbolTable.rootScope.environment.symbols.length,
      ).toBe(0);
    }
  });

  test('validate single document getinfo first', async () => {
    const uri = URI.file('/example/folder/example.ks').toString();

    const documents = new Map([
      [uri, TextDocument.create(uri, 'kos', 1.0, 'print(10).')],
    ]);
    const docService = createMockDocumentService(
      documents,
      URI.file('/').toString(),
    );

    const analysisService = new AnalysisService(
      CaseKind.camelCase,
      mockLogger,
      mockTracer,
      docService,
    );

    const documentInfo = await analysisService.getInfo(uri);

    expect(documentInfo).toBeDefined();

    if (!empty(documentInfo)) {
      expect(documentInfo.symbolTable.dependencyTables.size).toBe(2);
      expect(documentInfo.script.stmts.length).toBe(1);
      expect(
        documentInfo.symbolTable.rootScope.environment.symbols.length,
      ).toBe(0);
    }

    const diagnostics = await analysisService.validateDocument(
      uri,
      (documents.get(uri) as TextDocument).getText(),
    );
    expect(diagnostics.length).toBe(0);

    if (!empty(documentInfo)) {
      expect(documentInfo.symbolTable.dependencyTables.size).toBe(0);
      expect(documentInfo.diagnostics).toStrictEqual(diagnostics);
      expect(documentInfo.script.stmts.length).toBe(1);
      expect(
        documentInfo.symbolTable.rootScope.environment.symbols.length,
      ).toBe(0);
    }
  });

  test('set case', async () => {
    const uri = URI.file('/example/folder/example.ks').toString();

    const documents = new Map([
      [uri, TextDocument.create(uri, 'kos', 1.0, 'print(10).')],
    ]);
    const docService = createMockDocumentService(
      documents,
      URI.file('/').toString(),
    );

    const analysisService = new AnalysisService(
      CaseKind.lowerCase,
      mockLogger,
      mockTracer,
      docService,
    );

    let bodyLib = analysisService['bodyLibrary'];
    let stdLib = analysisService['bodyLibrary'];

    for (const bodySymbol of bodyLib.allSymbols()) {
      expect(bodySymbol.name.lexeme).toBe(bodySymbol.name.lexeme.toLowerCase());
    }

    for (const stdSymbol of stdLib.allSymbols()) {
      expect(stdSymbol.name.lexeme).toBe(stdSymbol.name.lexeme.toLowerCase());
    }

    analysisService.setCase(CaseKind.upperCase);

    bodyLib = analysisService['bodyLibrary'];
    stdLib = analysisService['bodyLibrary'];

    for (const bodySymbol of bodyLib.allSymbols()) {
      expect(bodySymbol.name.lexeme).toBe(bodySymbol.name.lexeme.toUpperCase());
    }

    for (const stdSymbol of stdLib.allSymbols()) {
      expect(stdSymbol.name.lexeme).toBe(stdSymbol.name.lexeme.toUpperCase());
    }
  });

  test('validate multiple documents', async () => {
    const uri1 = URI.file('/example/folder/example1.ks').toString();
    const uri2 = URI.file('/example/folder/example2.ks').toString();
    const baseUri = URI.file('/example/folder').toString();

    const documents = new Map([
      [
        uri1,
        TextDocument.create(
          uri1,
          'kos',
          1.0,
          'runOncePath("example2.ks"). hi().',
        ),
      ],
      [
        uri2,
        TextDocument.create(uri2, 'kos', 1.0, 'function hi { print("hi"). }'),
      ],
    ]);
    const docService = createMockDocumentService(documents, baseUri);

    const analysisService = new AnalysisService(
      CaseKind.camelCase,
      mockLogger,
      mockTracer,
      docService,
    );

    const diagnostics = await analysisService.validateDocument(
      uri1,
      (documents.get(uri1) as TextDocument).getText(),
    );
    const documentInfo1 = await analysisService.getInfo(uri1);
    const documentInfo2 = await analysisService.getInfo(uri2);

    expect(diagnostics.length).toBe(0);
    expect(documentInfo1).toBeDefined();
    expect(documentInfo2).toBeDefined();

    if (!empty(documentInfo1) && !empty(documentInfo2)) {
      expect(documentInfo1.symbolTable.dependencyTables.size).toBe(3);
      expect(documentInfo2.symbolTable.dependencyTables.size).toBe(2);
      expect(documentInfo1.symbolTable.dependencyTables).toContain(
        documentInfo2.symbolTable,
      );

      expect(documentInfo1.diagnostics).toStrictEqual(diagnostics);
      expect(documentInfo1.script.stmts.length).toBe(2);
      expect(documentInfo2.script.stmts.length).toBe(1);
      expect(
        documentInfo1.symbolTable.rootScope.environment.symbols().length,
      ).toBe(0);

      expect(
        documentInfo2.symbolTable.rootScope.environment.symbols().length,
      ).toBe(1);
    }
  });

  test('validate multiple with updates documents', async () => {
    const uri1 = URI.file('/example/folder/example1.ks').toString();
    const uri2 = URI.file('/example/folder/example2.ks').toString();
    const baseUri = URI.file('/example/folder').toString();

    const documents = new Map([
      [
        uri1,
        TextDocument.create(
          uri1,
          'kos',
          1.0,
          'runOncePath("example2.ks"). hi().',
        ),
      ],
      [
        uri2,
        TextDocument.create(uri2, 'kos', 1.0, 'function hi { print("hi"). }'),
      ],
    ]);
    const docService = createMockDocumentService(documents, baseUri);

    const analysisService = new AnalysisService(
      CaseKind.camelCase,
      mockLogger,
      mockTracer,
      docService,
    );

    // initial load of example1.ks
    const diagnostics11 = await analysisService.validateDocument(
      uri1,
      (documents.get(uri1) as TextDocument).getText(),
    );
    const documentInfo11 = await analysisService.getInfo(uri1);

    // load from client example2.ks
    const diagnostics21 = await analysisService.validateDocument(
      uri2,
      (documents.get(uri2) as TextDocument).getText(),
    );
    const documentInfo21 = await analysisService.getInfo(uri2);

    // update load of example1.ks
    const diagnostics12 = await analysisService.validateDocument(
      uri1,
      (documents.get(uri1) as TextDocument).getText(),
    );
    const documentInfo12 = await analysisService.getInfo(uri1);

    // update load of example2.ks
    const diagnostics22 = await analysisService.validateDocument(
      uri2,
      (documents.get(uri2) as TextDocument).getText(),
    );
    const documentInfo22 = await analysisService.getInfo(uri2);

    expect(diagnostics11.length).toBe(0);
    expect(diagnostics12.length).toBe(0);
    expect(diagnostics21.length).toBe(0);
    expect(diagnostics22.length).toBe(0);

    expect(documentInfo11).toBeDefined();
    expect(documentInfo12).toBeDefined();
    expect(documentInfo21).toBeDefined();
    expect(documentInfo22).toBeDefined();

    const documentInfos = analysisService['documentInfos'];

    if (!empty(documentInfo11) && !empty(documentInfo21)) {
      expect(documentInfo11.symbolTable.dependencyTables.size).toBe(0);
      expect(documentInfo11.symbolTable.dependentTables.size).toBe(0);
      expect(documentInfo21.symbolTable.dependencyTables.size).toBe(0);
      expect(documentInfo21.symbolTable.dependentTables.size).toBe(0);

      expect(documentInfo11.diagnostics).toStrictEqual(diagnostics11);
      expect(documentInfo11.diagnostics).toStrictEqual(diagnostics12);
      expect(documentInfo21.diagnostics).toStrictEqual(diagnostics21);
      expect(documentInfo21.diagnostics).toStrictEqual(diagnostics22);

      expect(documentInfos.get(uri1)).not.toBe(documentInfo11);
      expect(documentInfos.get(uri2)).not.toBe(documentInfo21);
    }

    if (!empty(documentInfo12) && !empty(documentInfo22)) {
      expect(documentInfo12.symbolTable.dependencyTables.size).toBe(3);
      expect(documentInfo12.symbolTable.dependentTables.size).toBe(0);
      expect(documentInfo22.symbolTable.dependencyTables.size).toBe(2);
      expect(documentInfo22.symbolTable.dependentTables.size).toBe(1);

      expect(documentInfos.get(uri1)).toBe(documentInfo12);
      expect(documentInfos.get(uri2)).toBe(documentInfo22);
    }
  });
});

// #region string scripts
const regionFold = `
// #region

// #endregion
`;

const blockFold = `
if true {

}

function example {
  print("hi").
}
`;

const bothFold = `
// #region
if true {

}

function example {
  print("hi").
}
// #endregion
`;
// #endregion

const fakeUri = 'file:///fake.ks';

interface ScanParseResult {
  scan: Tokenized;
  parse: Ast;
}

// parse source
const parseSource = (source: string): ScanParseResult => {
  const scanner = new Scanner(source, fakeUri);
  const scan = scanner.scanTokens();

  const parser = new Parser(fakeUri, scan.tokens);
  const parse = parser.parse();

  return { scan, parse };
};

const noParseErrors = (result: ScanParseResult): void => {
  expect(result.scan.scanDiagnostics.length).toBe(0);
  expect(result.parse.parseDiagnostics.length).toBe(0);
};

describe('foldableService', () => {
  test('Fold region', () => {
    const result = parseSource(regionFold);
    noParseErrors(result);

    const service = new FoldableService();
    const foldable = service.findRegions(
      result.parse.script,
      result.scan.regions,
    );

    const folds: FoldingRange[] = [
      {
        startCharacter: 0,
        startLine: 1,
        endCharacter: 13,
        endLine: 3,
        kind: 'region',
      },
    ];

    expect(foldable).toContainEqual(folds[0]);
  });

  test('Fold block', () => {
    const result = parseSource(blockFold);
    noParseErrors(result);

    const service = new FoldableService();
    const foldable = service.findRegions(
      result.parse.script,
      result.scan.regions,
    );

    expect(foldable.length).toBe(2);
    const folds: FoldingRange[] = [
      {
        startCharacter: 8,
        startLine: 1,
        endCharacter: 1,
        endLine: 3,
        kind: 'region',
      },
      {
        startCharacter: 17,
        startLine: 5,
        endCharacter: 1,
        endLine: 7,
        kind: 'region',
      },
    ];

    expect(foldable).toContainEqual(folds[0]);
    expect(foldable).toContainEqual(folds[1]);
  });

  test('Fold both', () => {
    const result = parseSource(bothFold);
    noParseErrors(result);

    const service = new FoldableService();
    const foldable = service.findRegions(
      result.parse.script,
      result.scan.regions,
    );

    expect(foldable.length).toBe(3);
    const folds: FoldingRange[] = [
      {
        startCharacter: 8,
        startLine: 2,
        endCharacter: 1,
        endLine: 4,
        kind: 'region',
      },
      {
        startCharacter: 17,
        startLine: 6,
        endCharacter: 1,
        endLine: 8,
        kind: 'region',
      },
      {
        startCharacter: 0,
        startLine: 1,
        endCharacter: 13,
        endLine: 9,
        kind: 'region',
      },
    ];

    expect(foldable).toContainEqual(folds[0]);
    expect(foldable).toContainEqual(folds[1]);
    expect(foldable).toContainEqual(folds[2]);
  });
});
