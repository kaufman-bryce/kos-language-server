import { ArgumentType } from './types';
import { createStructureType, createSuffixType, createArgSuffixType } from "../typeCreators";
import { addPrototype, addSuffixes } from '../typeUitlities';
import { listType } from './collections/list';
import { voidType } from './primitives/void';
import { scalarType, integarType } from './primitives/scalar';
import { stringType } from './primitives/string';
import { booleanType } from './primitives/boolean';
import { serializableStructureType } from './primitives/serializeableStructure';

export const timeWarpType: ArgumentType = createStructureType('timeWarp');
addPrototype(timeWarpType, serializableStructureType);

addSuffixes(
  timeWarpType,
  createSuffixType('rate', scalarType),
  createSuffixType('rateList', listType.toConcreteType(scalarType)),
  createSuffixType('railRateList', listType.toConcreteType(scalarType)),
  createSuffixType('physicsRateList', listType.toConcreteType(scalarType)),
  createSuffixType('mode', stringType),
  createSuffixType('warp', integarType),
  createArgSuffixType('warpTo', scalarType),
  createArgSuffixType('cancelWarp', voidType),
  createArgSuffixType('physicsDeltaT', scalarType),
  createArgSuffixType('isSettled', booleanType),
);
