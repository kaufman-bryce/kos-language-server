import {
  createArgSuffixType,
  createParametricType,
  createParametricArgSuffixType,
  noMap,
  mapTypes,
  createIndexer,
} from '../../typeCreators';
import { voidType } from '../primitives/void';
import { scalarType, integerType } from '../primitives/scalar';
import { collectionType } from './enumerable';
import { stringType } from '../primitives/string';

export const listType = createParametricType('list', ['T']);
listType.addSuper(mapTypes(listType, collectionType));

const indexer = createIndexer(['T'], scalarType, 'T');
listType.addIndexer(mapTypes(listType, indexer));

const addSuffix = createParametricArgSuffixType('add', ['T'], voidType, 'T');
const insertSuffix = createParametricArgSuffixType(
  'insert',
  ['T'],
  voidType,
  scalarType,
  'T',
);
const indexOfSuffix = createParametricArgSuffixType(
  'indexOf',
  ['T'],
  integerType,
  'T',
);
const findSuffix = createParametricArgSuffixType('find', ['T'], integerType, 'T');
const lastIndexOfSuffix = createParametricArgSuffixType(
  'lastIndexOf',
  ['T'],
  integerType,
  'T',
);
const findLastSuffix = createParametricArgSuffixType(
  'findLast',
  ['T'],
  integerType,
  'T',
);
const subListSuffix = createParametricArgSuffixType(
  'sublist',
  ['T'],
  listType,
  scalarType,
  scalarType,
);
const copySuffix = createParametricArgSuffixType('copy', ['T'], listType);

listType.addSuffixes(
  mapTypes(listType, copySuffix),
  mapTypes(listType, addSuffix),
  mapTypes(listType, insertSuffix),
  noMap(createArgSuffixType('remove', voidType, scalarType)),
  mapTypes(listType, subListSuffix),
  noMap(createArgSuffixType('join', stringType, stringType)),
  mapTypes(listType, indexOfSuffix),
  mapTypes(listType, findSuffix),
  mapTypes(listType, lastIndexOfSuffix),
  mapTypes(listType, findLastSuffix),
);
