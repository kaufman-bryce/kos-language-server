import { IGenericArgumentType } from '../types';
import {
  createArgSuffixType, createGenericStructureType,
  tType, createGenericArgSuffixType,
} from '../ksType';
import { addPrototype, addSuffixes } from '../typeUitlities';
import { serializableStructureType } from '../structure';
import { scalarType, booleanType, stringType } from '../primitives';
import { enumeratorType } from './enumerator';
import { iterator } from '../../../utilities/constants';

export const enumerableType: IGenericArgumentType = createGenericStructureType('enumerable');
addPrototype(enumerableType, serializableStructureType);

addSuffixes(
  enumerableType,
  createArgSuffixType(iterator, enumeratorType),
  createArgSuffixType('reverseIterator', enumeratorType),
  createArgSuffixType('length', scalarType),
  createGenericArgSuffixType('contains', booleanType, tType),
  createArgSuffixType('empty', booleanType),
  createArgSuffixType('dump', stringType),
);
