/**
 * Parse SVG path data to PIXI Graphics object.
 * @module utils/parsePathData
 * @author Jorge Gonzalez <jorge.gonzalez@live.com>
 */

import {chunk, pipe, tap} from './utils'

/**
 * Parses SVG paths commands to a PIXI.Graphics object. Note: A command is not
 * supported.
 *
 * @param      {string}         d            SVG path data string.
 * @param      {PIXI.Graphics}  graphics     A PIXI graphics instance.
 * @return     {PIXI.Graphics}  the supplied PIXI graphics instance.
 */
export default function parsePathData (d, graphics) {

  const commandRegex = /[A-DF-Z] ?(?:-?[\d\.]+[, ]?)*/gi
  const coordsRegex = /-?\d+(?:\.\d+)?/g
  const numbOfArgsByCommand = {M: 2, L: 2, T: 2, Q: 4, S: 4, C: 6}
  // PIXI Graphics draw functions
  const pixiDrawFns = {M: 'moveTo', L: 'lineTo', Q: 'quadraticCurveTo', C: 'bezierCurveTo'}

  // ## Utils
  cd
  const isEqual = (a1, a2) => a1.length === a2.length && a1.every((v,i)=> v === a2[i])
  
  // ## State

  // The end Point of the previous command will be the first of the next command.
  let lastPoint = [ 0, 0 ]
  // Control pt to be mirrored, in T and S.
  let lastControl
  // The last M 'moveTo' is the begining of the current subpath and could be needed if closing with Z.
  let firstPoint

   /**
   * Store the begin of the path or subpath, that is the last M command.
   *
   * @param      {DrawCommand}  DrawCommand
   * @returns    {DrawCommand}  DrawCommand
   */
  const storeFirstPoint = ({commandChar, coords}) => {
    firstPoint = coords.slice(0, 2)
    return {commandChar, coords}
  }

  /**
   * Store the previous end point for conversion to absolute positions
   * and the calculation of T and S reflexed control point.
   *
   * @param      {DrawCommand}  DrawCommand
   * @returns    {DrawCommand}  DrawCommand
   */
  const storeLastPoint = ({commandChar, coords}) => {
    lastPoint = coords.slice(-2)
    return {commandChar, coords}
  }

  /**
   * T and S are shortcust of Q and C commands, omiting the first control point 
   * when it is a reflexion of the previous command last control point.
   *
   * @param      {DrawCommand}  DrawCommand
   * @returns    {DrawCommand}  DrawCommand
   */
  const storeLastControl = ({commandChar, coords}) => {
    lastControl = coords.slice(-4, -2)
    return {commandChar, coords}
  }

  // ## Logic

  const getCommand = (segment) => segment.charAt(0)

  /**
   * DrawCommand object, where data: commandChar and coords is passed between functions.
   * 
   * @typedef     {Object}    DrawCommand
   * @property    {string}    commandChar   - Single character that incdicates the drawing command.
   * @property    {number[]}  coords        - Command arguments.
   */
  /**
   * Extracts the args from the segment to an array in the coords prop.
   *
   * @param      {string}   commandChar  Character command.
   * @param      {string}   segment      The segment.
   * @returns    {DrawCommand}  DrawCommand
   */
  const getCommandObj = (commandChar, segment) => ({
    commandChar, 
    coords:segment.match(coordsRegex).map(Number)
  })

  /**
   * Converts vertical or horizontal command to line command.
   *
   * @param      {DrawCommand}  DrawCommand
   * @returns    {DrawCommand}  DrawCommand
   */
  const toLine = ({commandChar, coords}) => {
    let isAbsolute = /^[HV]/.test(commandChar)
    let axis = /^H/i.test(commandChar) ? 0 : 1
    let basePoint = isAbsolute ? lastPoint : [0,0]
    return {
      commandChar: isAbsolute ? 'L' : 'l',
      coords: coords.reduce((list, arg) => list.concat(((basePoint[axis] = arg) && basePoint)), [])
    }
  }

  /**
   * Converts relative to absolute coords.
   *
   * @param      {DrawCommand}  DrawCommand
   * @returns    {DrawCommand}  DrawCommand
   */
  const toAbsolute = ({commandChar, coords}) => ({
    commandChar: commandChar.toUpperCase(), 
    coords: coords.map((val, idx) => val + lastPoint[ idx % 2 ])
  })

  /**
   * Converts T to Q or S to C commands.
   *
   * @param      {DrawCommand}  DrawCommand
   * @returns    {DrawCommand}  DrawCommand
   */
  const prependReflexedControlPoint = ({commandChar, coords}) => ({
    commandChar: commandChar == 'T' ? 'Q' : 'C',
    coords: lastPoint.map((axis, idx) => 2 * lastPoint[idx] - lastControl[idx]).concat(coords)
  })

  /**
   * Converts one DrawCommand object with one or more sequences of arguments
   * into an array of one or more DrawCommand objects.
   *
   * @param      {DrawCommand}    DrawCommand
   * @return     {DrawCommand[]}  Sequence of Comand objcs.
   */
  const splitArgsSequence = ({commandChar, coords}) => {
    return chunk(coords, numbOfArgsByCommand[commandChar]).map((args) => ({
      commandChar, 
      coords: args
    }))
  }

  /**
   * The M command sequence is really a  first M command followed by L commands.
   *
   * @param      {DrawCommand[]}  DrawCommand sequence.
   * @return     {DrawCommand[]}  DrawCommand sequence.
   */
  const fixMSequence = (commands) => commands.map( ({commandChar, coords}, idx) => ({
    commandChar: idx > 0 ? 'L' : 'M',
    coords
  }))

  /**
   * The Z command means close path, by drawing a straight line to the begining of the path.
   * 
   * @return     {DrawCommand}  DrawCommand
   */

  const lineToFirstPoint = () => ({
    commandChar: 'L',
    coords: firstPoint
  })

  const callCommands = (commands, graphics) => {
    commands.forEach(({commandChar, coords}) => graphics[pixiDrawFns[commandChar]](...coords))
    return graphics
  }

  // const sowPoints = (commands, graphics) => {
  //   let points = commands.reduce((container, {_, coords}) => coords
  //     .reduce((pairs, _, i, a) => {if (i % 2 === 0) pairs.push([a[i], a[i+1]]); return pairs}, container), [])
  //   points.forEach(point => graphics.drawCircle(...point, 5))
  //   console.log(points)
  //   return graphics
  // }

  // ## Parsing pipeline
   
  const L = pipe(storeLastPoint, splitArgsSequence)

  const M = pipe(storeFirstPoint, L, fixMSequence)
  // C
  const Q = pipe(storeLastPoint, storeLastControl, splitArgsSequence)
  // S
  const T = pipe(splitArgsSequence, seq => seq.map(pipe(prependReflexedControlPoint, storeLastPoint, storeLastControl)))
  // H
  const V = pipe(toLine, L)
  // z
  const Z = pipe(lineToFirstPoint, L)

  const l = pipe(toAbsolute, L)

  const m = pipe(toAbsolute, M)
  // c
  const q = pipe(toAbsolute, Q)
  // s
  const t = pipe(toAbsolute, T)
  // h
  const v = pipe(toLine, l)

  // Some parse pipes are also reused by others that allready have data.
  const init = (cmdPipe) => pipe(getCommandObj, cmdPipe)

  // Fix when Z command is already in the last point.
  const CloseIfOpen = () => !isEqual(firstPoint, lastPoint) ? Z() : []

  // Entry point for the data in the pipes.
  const parse = {
    M: init(M), L: init(L), Q: init(Q), T: init(T), V: init(V), Z: CloseIfOpen, 
    m: init(m), l: init(l), q: init(q), t: init(t), v: init(v), 
    C: init(Q), S: init(T), H: init(V), c: init(q), s: init(t), h: init(v), z: CloseIfOpen
  }

  // ## Call the transformation

  d.match(commandRegex).forEach((segment) => {
    let command = getCommand(segment)
    // sowPoints(parse[command](command, segment), graphics)
    callCommands(parse[command](command, segment), graphics)
  })

  return graphics
}
