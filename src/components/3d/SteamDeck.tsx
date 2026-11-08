'use client'

import React, { useRef, useEffect, useMemo } from 'react'
import { useScroll, Center } from '@react-three/drei'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { deckState, showcaseState } from './deckState'
import { getSteamScreenController } from './SteamScreenTexture'
import { SHOWCASE_GAMES } from '../ui/GameShowcaseReel'

/**
 * Console closeup positioning in boot standby (Section 00):
 * - INITIAL_CLOSEUP_Y: Vertical offset
 * - INITIAL_CLOSEUP_Z: Zoom / distance to camera (camera at Z=9)
 */
const INITIAL_CLOSEUP_Y = 0.20
const INITIAL_CLOSEUP_Z = 7.96

const _tempWorldPos = new THREE.Vector3()
const _vCornerTL = new THREE.Vector3()
const _vCornerBR = new THREE.Vector3()
const _vMidL = new THREE.Vector3()
const _vMidR = new THREE.Vector3()
const _vScreenSplit = new THREE.Vector3()
const _tempColorL = new THREE.Color()
const _tempColorR = new THREE.Color()

export function SteamDeck(props: React.ComponentProps<'group'>) {
  const scroll = useScroll()
  const { gl } = useThree()
  const state = useLoader(GLTFLoader, '/models/steam_deck.glb')
  const { nodes, materials } = state as unknown as { nodes: Record<string, any>; materials: Record<string, any> }

  // Dynamic screen controller (OLED standby video, SteamOS UI)
  const screenController = useMemo(() => getSteamScreenController(), [])

  // Maximum anisotropic filtering optimization for Full HD 1080p and high-res displays:
  // Eliminates texture blurring and restores physical plastic grain & knurling at glancing angles.
  useEffect(() => {
    if (!state.scene || !gl) return
    const maxAnisotropy = Math.min(16, gl.capabilities.getMaxAnisotropy())
    state.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh
        const mat = mesh.material as THREE.MeshStandardMaterial
        if (mat) {
          const textures = [mat.map, mat.normalMap, mat.roughnessMap, mat.metalnessMap, mat.aoMap]
          textures.forEach((tex) => {
            if (tex) {
              tex.anisotropy = maxAnisotropy
              tex.needsUpdate = true
            }
          })
        }
      }
    })
    if (screenController?.texture) {
      screenController.texture.anisotropy = maxAnisotropy
    }
  }, [state.scene, gl, screenController])
  const screenShaderUniforms = useRef({
    uScrollOffset: { value: 0 },
    uSimulateLcd: { value: 0 },
    uSplitPos: { value: 0.5 },
    uDarkroom: { value: 0 },
    uBezelDiff: { value: 0 },
  })
  const bezelDiffRef = useRef(0)

  // Screen mesh UV normalization:
  // Maps the physical screen face plane to UV coordinates [0..1] x [0..1],
  // ensuring proper 16:10 texture orientation and sharpness without flips.
  useEffect(() => {
    if (nodes && nodes.steam_deck_steam_deck_mat03_0) {
      const mesh = nodes.steam_deck_steam_deck_mat03_0 as THREE.Mesh
      const geom = mesh.geometry
      const pos = geom.attributes.position
      const uv = geom.attributes.uv
      const minX = -0.08840339
      const maxX = 0.08723613
      const minY = -0.06326957
      const maxY = 0.04444661

      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i)
        const y = pos.getY(i)
        const u = THREE.MathUtils.clamp((x - minX) / (maxX - minX), 0, 1)
        const v = THREE.MathUtils.clamp((y - minY) / (maxY - minY), 0, 1)
        uv.setXY(i, u, v)
      }
      uv.needsUpdate = true
    }
  }, [nodes])

  // Calibrated button & thumbstick ambient bounce lights.
  // Positioned directly above physical controls OUTSIDE the screen bounds (x = ±0.108, z = 0.026).
  // Distance is localized to 0.85 with decay 2.0 so light softly catches the sticks/buttons without casting onto screen glass.
  const leftBounceLight = useMemo(() => new THREE.PointLight(0x000000, 0, 0.85, 2.0), [])
  const rightBounceLight = useMemo(() => new THREE.PointLight(0x000000, 0, 0.85, 2.0), [])

  useEffect(() => {
    if (nodes && nodes.steam_deck_steam_deck_mat03_0) {
      const mesh = nodes.steam_deck_steam_deck_mat03_0 as THREE.Mesh
      leftBounceLight.position.set(-0.108, 0.014, 0.026)
      rightBounceLight.position.set(0.108, 0.014, 0.026)

      mesh.add(leftBounceLight)
      mesh.add(rightBounceLight)

      return () => {
        mesh.remove(leftBounceLight)
        mesh.remove(rightBounceLight)
      }
    }
  }, [nodes, leftBounceLight, rightBounceLight])

  // Calibrated PBR materials
  useEffect(() => {
    if (materials) {
      // Chassis (steam_deck_mat01): silky graphite polymer balanced for white background
      if (materials.steam_deck_mat01) {
        const mat = materials.steam_deck_mat01 as THREE.MeshStandardMaterial
        mat.color.setRGB(1.85, 1.88, 1.95) // Deep graphite without crushing blacks or washing out to grey
        mat.roughness = 0.60
        mat.metalness = 0.04
        mat.envMapIntensity = 1.0
        mat.transparent = false
        mat.opacity = 1.0
        mat.needsUpdate = true
      }

      // Controls (steam_deck_mat02): buttons, thumbsticks, trackpads
      if (materials.steam_deck_mat02) {
        const mat = materials.steam_deck_mat02 as THREE.MeshStandardMaterial
        mat.color.setRGB(1.75, 1.78, 1.85)
        mat.roughness = 0.44
        mat.metalness = 0.08
        mat.envMapIntensity = 1.1
        mat.transparent = false
        mat.opacity = 1.0
        mat.needsUpdate = true
      }

      // OLED Screen (steam_deck_mat03): anti-glare etched glass with soft specular sheen
      if (materials.steam_deck_mat03) {
        const mat = materials.steam_deck_mat03 as THREE.MeshStandardMaterial
        mat.map = screenController.texture
        mat.emissiveMap = screenController.texture
        mat.emissive = new THREE.Color(0xffffff)
        mat.emissiveIntensity = 0.90 // Calibrated OLED emissive luminance
        mat.roughness = 0.26 // Etched glass: soft diffused specular highlight instead of sharp mirror reflection
        mat.metalness = 0.02
        mat.envMapIntensity = 0.35
        mat.transparent = false
        mat.opacity = 1.0

        // Custom shader: pixel grid structure and dynamic LCD/OLED split-screen
        // Zero light reflection prior to uScrollOffset = 0.15; gradual realistic glass sheen on liftoff.
        mat.customProgramCacheKey = () => 'steamdeck_oled_matrix_v18'
        mat.onBeforeCompile = (shader) => {
          shader.uniforms.uScrollOffset = screenShaderUniforms.current.uScrollOffset
          shader.uniforms.uSimulateLcd = screenShaderUniforms.current.uSimulateLcd
          shader.uniforms.uSplitPos = screenShaderUniforms.current.uSplitPos
          shader.uniforms.uDarkroom = screenShaderUniforms.current.uDarkroom
          shader.uniforms.uBezelDiff = screenShaderUniforms.current.uBezelDiff
          mat.userData.shader = shader
          shader.fragmentShader =
            'uniform float uScrollOffset;\nuniform float uSimulateLcd;\nuniform float uSplitPos;\nuniform float uDarkroom;\nuniform float uBezelDiff;\n' +
            'const vec2 OLED_BEZEL_MIN = vec2(0.048, 0.038);\n' +
            'const vec2 OLED_BEZEL_MAX = vec2(0.952, 0.958);\n' +
            'const vec2 LCD_BEZEL_MIN = vec2(0.0724, 0.0629);\n' +
            'const vec2 LCD_BEZEL_MAX = vec2(0.9276, 0.9331);\n' +
            shader.fragmentShader

          // Replace map_fragment: accurate 1280x800 OLED texture mapping with Steam Deck bezel
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <map_fragment>',
            `
            #ifdef USE_MAP
              // Steam Deck OLED bezel bounds (calibrated to real hardware):
              bool isInsideScreenMap = (vMapUv.x >= OLED_BEZEL_MIN.x && vMapUv.x <= OLED_BEZEL_MAX.x && vMapUv.y >= OLED_BEZEL_MIN.y && vMapUv.y <= OLED_BEZEL_MAX.y);
              vec2 activeScreenUv = clamp((vMapUv - OLED_BEZEL_MIN) / (OLED_BEZEL_MAX - OLED_BEZEL_MIN), 0.0, 1.0);

              vec4 sampledDiffuseColor = isInsideScreenMap ? texture2D( map, activeScreenUv ) : vec4(0.012, 0.012, 0.015, 1.0);

              #ifdef DECODE_VIDEO_TEXTURE
                if (isInsideScreenMap) {
                  sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
                }
              #endif

              // Scene 1 maintains stable brightness and subtle glass sheen.
              // External diffused light fades out strictly in Scene 2 (OLED Darkroom).
              float mapDarkFade = 1.0 - uDarkroom;
              float extDiffuse = 0.15 * smoothstep(0.15, 0.24, uScrollOffset) * mapDarkFade;
              diffuseColor *= sampledDiffuseColor;
              diffuseColor.rgb *= extDiffuse;
              diffuseColor.a = 1.0;
            #endif
            `
          )

          // Replace emissivemap_fragment: hardware-accurate simulation of Steam Deck LCD vs OLED:
          // Default Scene 2 uses authentic 7.4" OLED bezels.
          // When uBezelDiff = 0, LCD and OLED video match 1:1 without distortion.
          // When uBezelDiff = 1, LCD side switches to 7.0" thicker bezels with rescaled video.
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <emissivemap_fragment>',
            `
            #ifdef USE_EMISSIVEMAP
              vec2 rawEmissiveUv = vEmissiveMapUv;

              // Split wipe X coordinate in rawEmissiveUv space:
              float activeSplitT = max(uDarkroom, smoothstep(0.46, 0.58, uScrollOffset));
              float splitX = mix(OLED_BEZEL_MIN.x, OLED_BEZEL_MAX.x, uSplitPos);
              float currentSplitX = mix(OLED_BEZEL_MAX.x, splitX, activeSplitT);

              bool isLcdSide = (rawEmissiveUv.x >= currentSplitX);

              if (!isLcdSide) {
                // 1. OLED SIDE (7.4" diagonal, slim OLED bezels, 0-nit true black, 110% DCI-P3):
                bool insideOled = (rawEmissiveUv.x >= OLED_BEZEL_MIN.x && rawEmissiveUv.x <= OLED_BEZEL_MAX.x &&
                                   rawEmissiveUv.y >= OLED_BEZEL_MIN.y && rawEmissiveUv.y <= OLED_BEZEL_MAX.y);

                if (!insideOled) {
                  // Default black bezel around Steam Deck OLED screen
                  totalEmissiveRadiance = vec3(0.0);
                } else {
                  vec2 uvOled = clamp((rawEmissiveUv - OLED_BEZEL_MIN) / (OLED_BEZEL_MAX - OLED_BEZEL_MIN), 0.0, 1.0);
                  vec4 emissiveColor = texture2D( emissiveMap, uvOled );

                  #ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
                    emissiveColor = sRGBTransferEOTF( emissiveColor );
                  #endif

                  vec3 oledColor = emissiveColor.rgb;

                  // OLED active matrix edge anti-aliasing:
                  vec2 pixelDistOled = min(rawEmissiveUv - OLED_BEZEL_MIN, OLED_BEZEL_MAX - rawEmissiveUv);
                  float borderSmoothOled = clamp(min(pixelDistOled.x, pixelDistOled.y) * 600.0, 0.0, 1.0);

                  totalEmissiveRadiance = emissive * oledColor * borderSmoothOled;
                }
              } else {
                // 2. LCD SIDE (uBezelDiff = 0: default 7.4" within OLED bounds;
                //               uBezelDiff = 1: 7.0" diagonal, widened bezels, and scaled viewport):
                vec2 targetLcdMin = mix(OLED_BEZEL_MIN, LCD_BEZEL_MIN, uBezelDiff);
                vec2 targetLcdMax = mix(OLED_BEZEL_MAX, LCD_BEZEL_MAX, uBezelDiff);

                bool insideLcd = (rawEmissiveUv.x >= targetLcdMin.x && rawEmissiveUv.x <= targetLcdMax.x &&
                                  rawEmissiveUv.y >= targetLcdMin.y && rawEmissiveUv.y <= targetLcdMax.y);

                if (!insideLcd) {
                  // Black bezel around LCD screen (thickens when toggle is active)
                  totalEmissiveRadiance = vec3(0.0);
                } else {
                  vec2 uvLcd = clamp((rawEmissiveUv - targetLcdMin) / (targetLcdMax - targetLcdMin), 0.0, 1.0);
                  vec4 emissiveColor = texture2D( emissiveMap, uvLcd );

                  #ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
                    emissiveColor = sRGBTransferEOTF( emissiveColor );
                  #endif

                  vec3 oledColor = emissiveColor.rgb;

                  // Rec.709 Luma luminance
                  float luma = dot(oledColor, vec3(0.2126, 0.7152, 0.0722));

                  // 1. Gamut compression to 68% sRGB (LCD):
                  vec3 lcdColor = mix(vec3(luma), oledColor, 0.70);

                  // 2. Contrast compression (IPS 1000:1 dynamic range vs OLED infinite contrast):
                  lcdColor = pow(lcdColor, vec3(0.92));

                  // 3. Realistic spectral response of original 68% sRGB panel:
                  // - Red spectrum: crimson shifts toward carrot-orange
                  float redDominance = max(0.0, oledColor.r - max(oledColor.g, oledColor.b));
                  lcdColor.r -= redDominance * 0.14;
                  lcdColor.g += redDominance * 0.09;

                  // - Green spectrum: vivid emerald shifts toward olive-mint
                  float greenDominance = max(0.0, oledColor.g - max(oledColor.r, oledColor.b));
                  lcdColor.b -= greenDominance * 0.07;
                  lcdColor.r += greenDominance * 0.06;

                  // - Blue/violet spectrum: deep indigo loses saturation toward steel blue
                  float violetDominance = max(0.0, min(oledColor.r * 1.4, oledColor.b) - oledColor.g);
                  lcdColor.r -= violetDominance * 0.18;
                  lcdColor.g += violetDominance * 0.05;
                  lcdColor = mix(lcdColor, vec3(luma), violetDominance * 0.22);

                  // 4. Color temperature: cooler ~7800K white point vs 6500K D65 on OLED:
                  vec3 coolWhitePoint = vec3(0.93, 0.97, 1.07);
                  lcdColor *= coolWhitePoint;

                  // 5. IPS backlight bleed black floor (0.35 nits):
                  float dTL = distance(uvLcd, vec2(0.0, 1.0));
                  float dTR = distance(uvLcd, vec2(1.0, 1.0));
                  float dBL = distance(uvLcd, vec2(0.0, 0.0));
                  float dBR = distance(uvLcd, vec2(1.0, 0.0));
                  float minCorner = min(min(dTL, dTR), min(dBL, dBR));
                  float cornerMicro = pow(clamp(1.0 - minCorner * 1.5, 0.0, 1.0), 2.5) * 0.002;

                  vec3 ipsBlackFloor = vec3(0.009, 0.010, 0.013) + vec3(cornerMicro);
                  vec3 simulatedLcd = lcdColor + ipsBlackFloor;

                  // LCD active matrix edge anti-aliasing:
                  vec2 pixelDistLcd = min(rawEmissiveUv - targetLcdMin, targetLcdMax - rawEmissiveUv);
                  float borderSmoothLcd = clamp(min(pixelDistLcd.x, pixelDistLcd.y) * 600.0, 0.0, 1.0);

                  totalEmissiveRadiance = emissive * simulatedLcd * borderSmoothLcd;
                }
              }

              // Clean hairline delimiter on split boundary:
              if (activeSplitT > 0.5 && uSplitPos > 0.003 && uSplitPos < 0.997 &&
                  rawEmissiveUv.y >= OLED_BEZEL_MIN.y && rawEmissiveUv.y <= OLED_BEZEL_MAX.y) {
                float distToLine = abs(rawEmissiveUv.x - currentSplitX);
                float lineCore = 1.0 - smoothstep(0.0, 0.0009, distToLine);
                totalEmissiveRadiance += vec3(lineCore * 0.85);
              }
            #endif
            `
          )

          // Screen specular reflection:
          // In Scene 1, screen maintains realistic glass sheen and diffused lighting.
          // In Scene 2 (OLED Darkroom), reflections are suppressed under closed shutters to eliminate color wash.
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <lights_fragment_end>',
            `
            #include <lights_fragment_end>
            float sheenDarkFade = 1.0 - uDarkroom;
            float glassSheen = smoothstep(0.15, 0.24, uScrollOffset) * sheenDarkFade;
            float fresnel = pow(1.0 - max(0.0, dot(geometryViewDir, geometryNormal)), 2.5);
            reflectedLight.directSpecular *= 0.18 * glassSheen;
            reflectedLight.directSpecular += vec3(fresnel * 0.08 * glassSheen);
            reflectedLight.indirectSpecular *= (0.35 * glassSheen);
            reflectedLight.directDiffuse *= sheenDarkFade;
            reflectedLight.indirectDiffuse *= sheenDarkFade;
            `
          )

          // Guarantee opaque framebuffer write so background DOM elements (like darkroom-aura) never bleed through screen
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <output_fragment>',
            `
            #include <output_fragment>
            gl_FragColor.a = 1.0;
            `
          )
        }

        mat.needsUpdate = true
      }
    }
  }, [materials, screenController])

  // Subscribe to game changes and scene transitions in OLED Darkroom
  useEffect(() => {
    const unsubGame = showcaseState.onGameChange((gameIdx) => {
      if (showcaseState.activeScene === 2) {
        const game = SHOWCASE_GAMES[gameIdx]
        if (game) {
          screenController.playVideo(game.videoUrl, true)
        }
      }
    })
    const unsubPortal = showcaseState.onPortalChange(({ phase: _phase, targetScene }) => {
      // Pre-warm video playback upon initiating any portal transition into Scene 2 (3 -> 2, 4 -> 2, 5 -> 2)
      // so the video frame and poster are loaded before the portal finishes opening/closing.
      if (targetScene === 2) {
        const game = SHOWCASE_GAMES[showcaseState.activeGameIndex] || SHOWCASE_GAMES[0]
        if (game) {
          screenController.prepareVideo(game.videoUrl)
          screenController.playVideo(game.videoUrl, false)
        }
      }
    })
    const unsubScene = showcaseState.onActiveSceneChange((scene) => {
      if (scene === 2) {
        const game = SHOWCASE_GAMES[showcaseState.activeGameIndex] || SHOWCASE_GAMES[0]
        if (game) {
          screenController.prepareVideo(game.videoUrl)
          if (!screenController.isPlaying() || screenController.getCurrentVideoUrl() !== game.videoUrl) {
            screenController.playVideo(game.videoUrl, false)
          }
        }
        SHOWCASE_GAMES.forEach((g) => {
          if (g.videoUrl !== game?.videoUrl) {
            screenController.prepareVideo(g.videoUrl)
          }
        })
      } else {
        // Do not pause video if portal is actively transitioning towards Scene 2:
        const isHeadingToScene2 = (showcaseState.portalPhase === 'closing' || showcaseState.portalPhase === 'opening') && showcaseState.portalTargetScene === 2
        if (!isHeadingToScene2) {
          screenController.stopVideo()
        }
      }
    })
    const unsubPhase = showcaseState.onShutterPhaseChange((phase) => {
      // Pre-start playback while shutters are closed:
      if (phase === 'closed' && showcaseState.activeScene === 2) {
        const game = SHOWCASE_GAMES[showcaseState.activeGameIndex] || SHOWCASE_GAMES[0]
        if (game) {
          screenController.playVideo(game.videoUrl, true)
        }
      }
    })
    return () => {
      unsubGame()
      unsubPortal()
      unsubScene()
      unsubPhase()
    }
  }, [screenController])

  const groupRef = useRef<THREE.Group>(null)

  // Cinematic scroll animation and mouse parallax
  useFrame((state, delta) => {
    if (!groupRef.current) return

    // Recovery on NaN
    if (isNaN(groupRef.current.position.x)) groupRef.current.position.set(0, -0.085, 7.5)
    if (isNaN(groupRef.current.rotation.x)) groupRef.current.rotation.set(0, 0, 0)

    // Guard against undefined/NaN scroll.offset during preloader
    const rawOffset = scroll && typeof scroll.offset === 'number' && !isNaN(scroll.offset) ? scroll.offset : 0
    const offset = showcaseState.isReady ? Math.max(0, Math.min(1, rawOffset)) : 0

    // Update screen shader uniforms: scroll offset and OLED / LCD comparison split
    const simVal = showcaseState.simulateLcd ? 1.0 : 0.0
    const splitVal = showcaseState.splitPos
    const is1to3or5Portal = showcaseState.portalPhase !== 'idle' && (
      (showcaseState.portalSourceScene === 1 && (showcaseState.portalTargetScene === 3 || showcaseState.portalTargetScene === 4 || showcaseState.portalTargetScene === 5)) ||
      ((showcaseState.portalSourceScene === 3 || showcaseState.portalSourceScene === 4 || showcaseState.portalSourceScene === 5) && showcaseState.portalTargetScene === 1)
    )
    const isScene2Involved = !is1to3or5Portal && (
      showcaseState.activeScene === 2 || 
      (showcaseState.portalPhase !== 'idle' && (showcaseState.portalSourceScene === 2 || showcaseState.portalTargetScene === 2))
    )
    const isDarkroomVal = isScene2Involved ? 1.0 : 0.0
    const isEnteringScene1 = showcaseState.portalPhase === 'closing' && showcaseState.portalTargetScene === 1
    const isScene2Active = showcaseState.activeScene === 2 || showcaseState.darkroomMode
    const effectiveShaderOffset = isEnteringScene1 ? 0.28 : (isScene2Active ? 0.65 : offset)
    const targetBezelDiff = showcaseState.showBezelDiff ? 1.0 : 0.0
    bezelDiffRef.current = THREE.MathUtils.damp(bezelDiffRef.current, targetBezelDiff, 10.0, delta)
    const bezelDiffVal = bezelDiffRef.current

    screenShaderUniforms.current.uScrollOffset.value = effectiveShaderOffset
    screenShaderUniforms.current.uSimulateLcd.value = simVal
    screenShaderUniforms.current.uSplitPos.value = splitVal
    screenShaderUniforms.current.uDarkroom.value = isDarkroomVal
    screenShaderUniforms.current.uBezelDiff.value = bezelDiffVal
    if (materials.steam_deck_mat03 && (materials.steam_deck_mat03 as any).userData?.shader?.uniforms) {
      const u = (materials.steam_deck_mat03 as any).userData.shader.uniforms
      if (u.uScrollOffset) u.uScrollOffset.value = effectiveShaderOffset
      if (u.uSimulateLcd) u.uSimulateLcd.value = simVal
      if (u.uSplitPos) u.uSplitPos.value = splitVal
      if (u.uDarkroom) u.uDarkroom.value = isDarkroomVal
      if (u.uBezelDiff) u.uBezelDiff.value = bezelDiffVal
    }

    // Dynamic chassis color: graphite tone under studio lighting in Scene 1, dark cinematic in Scene 2
    const darkProgress = isScene2Involved ? 1.0 : 0.0

    if (materials.steam_deck_mat01) {
      const mat01 = materials.steam_deck_mat01 as THREE.MeshStandardMaterial
      const r = THREE.MathUtils.lerp(1.85, 1.0, darkProgress)
      const g = THREE.MathUtils.lerp(1.88, 1.0, darkProgress)
      const b = THREE.MathUtils.lerp(1.95, 1.0, darkProgress)
      mat01.color.setRGB(r, g, b)
      mat01.roughness = THREE.MathUtils.lerp(0.60, 0.52, darkProgress)
      mat01.envMapIntensity = THREE.MathUtils.lerp(1.0, 0.85, darkProgress)
    }

    if (materials.steam_deck_mat02) {
      const mat02 = materials.steam_deck_mat02 as THREE.MeshStandardMaterial
      const r = THREE.MathUtils.lerp(1.75, 0.88, darkProgress)
      const g = THREE.MathUtils.lerp(1.78, 0.88, darkProgress)
      const b = THREE.MathUtils.lerp(1.85, 0.90, darkProgress)
      mat02.color.setRGB(r, g, b)
      mat02.roughness = THREE.MathUtils.lerp(0.44, 0.38, darkProgress)
      mat02.envMapIntensity = THREE.MathUtils.lerp(1.1, 0.75, darkProgress)
    }

    // Camera distance calculation for full screen coverage in viewport at Phase 0:
    const cam = state.camera as THREE.PerspectiveCamera
    const fov = cam.fov || 45
    const aspect = cam.aspect || (state.viewport.width / state.viewport.height) || 1.777
    const tanHalfFov = Math.tan(((fov / 2) * Math.PI) / 180)

    // Physical size of active screen area in world coordinates at scale = 15
    const activeScreenW = 2.38
    const activeScreenH = 1.48
    // Viewport coverage without letterboxing (analogous to CSS object-fit: cover)
    const maxCoverDistH = (activeScreenH / (2 * tanHalfFov)) * 0.92
    const maxCoverDistW = (activeScreenW / (2 * tanHalfFov * aspect)) * 0.92
    const maxCoverDist = Math.min(maxCoverDistH, maxCoverDistW)

    // Base distance matching Full HD (9.0 - INITIAL_CLOSEUP_Z = 1.04).
    // Across all ratios and resolutions, console maintains closeup framing without visible bezels.
    const baseCloseupDist = 9.0 - INITIAL_CLOSEUP_Z
    const effectiveBootDist = Math.min(baseCloseupDist, maxCoverDist)
    const bootTargetZ = 9.0 - effectiveBootDist

    // Interactive mouse parallax depth
    const pointerX = typeof state.pointer?.x === 'number' && !isNaN(state.pointer.x) ? state.pointer.x : 0
    const pointerY = typeof state.pointer?.y === 'number' && !isNaN(state.pointer.y) ? state.pointer.y : 0
    const mouseX = (pointerX * Math.PI) / 14
    const mouseY = (pointerY * Math.PI) / 14

    // Responsive layout mode: Stacked vs Full Desktop
    // Stacked (text centered above, console centered below): width <= 1024px or aspect <= 1.15
    // Desktop: width > 1024px and landscape aspect ratio
    const isStacked = (state.size.width <= 1024) || (aspect <= 1.15)

    // Responsive camera distance for Stacked / Mobile mode:
    // In mobile format (aspect < 1.0 or width <= 768px): zoom console to edge (~0.99 coverage)
    const isMobilePortrait = (state.size.width <= 768) || (aspect < 1.0)
    const targetDeckCoverage = isMobilePortrait ? 0.99 : 0.86
    const minStackedDist = 4.47 / (2 * tanHalfFov * aspect * targetDeckCoverage)
    const stackedDist = Math.max(7.2, minStackedDist)
    const stackedTargetZ = 9.0 - stackedDist

    // Desktop Hero positioning (Scene 1):
    // Prevent left grip collision with the [//] HARDWARE // ARCHITECTURE card on narrow screens.
    // The right edge of hero card is calculated dynamically with symmetric outer margin:
    const heroCardLeftPx = (() => {
      const cardW = state.size.width >= 1024 ? 420 : 380
      const dBase = state.size.width >= 1024 ? 64 : 56
      const dMin = 36
      const sMargin1 = state.size.width * 0.5 - 0.1435 * state.size.height - cardW
      if (sMargin1 >= 2 * dBase) return dBase
      return Math.max(dMin, Math.round(sMargin1 / 2))
    })()
    const cardRightPx = heroCardLeftPx + (state.size.width >= 1024 ? 420 : 380)
    // Symmetric minimum clearance boundary (36px):
    const minDeckGapPx = 36

    // Adaptive camera distance for Hero (Scene 1) on desktop:
    // On standard desktop ratios (aspect <= 2.05): distance is fixed at 5.68 (Z=3.32, X=1.475, Y=0.0).
    // Extreme banner aspect ratios (aspect > 2.05): softly scale distance to maintain vertical presence.
    const baselineAspect = 2.05
    let desktopCamDist = 5.68
    if (!isStacked && aspect > baselineAspect) {
      const aspectScale = baselineAspect / aspect
      desktopCamDist = Math.max(3.60, 5.68 * Math.pow(aspectScale, 0.70))
    }
    const desktopTargetPosZ = 9.0 - desktopCamDist

    const visibleWorldH = 2 * desktopCamDist * tanHalfFov
    const pxPerUnit = state.size.height / visibleWorldH
    const leftGripOffset = 2.15 // Left grip offset from console center in world units

    // Minimum X for heroTargetPosX to keep left grip clear of minDeckGapPx (36px):
    const minHeroTargetPosX = leftGripOffset + (cardRightPx + minDeckGapPx - state.size.width * 0.5) / pxPerUnit
    const clampedDesktopPosX = Math.max(1.475, minHeroTargetPosX)

    // Hero (Scene 1) coordinates:
    // When !isStacked: desktop coordinate 1.475 with dynamic clearance protection
    // When isStacked: centered (X=0) and positioned under text
    const heroTargetPosX = isStacked ? (0.0 + mouseX * 0.08) : (clampedDesktopPosX + mouseX * 0.15)
    const stackedTargetPosY = aspect < 1.0 ? -0.80 : (state.size.height < 750 ? -0.78 : -0.65)
    const heroTargetPosY = isStacked ? (stackedTargetPosY + mouseY * 0.08) : (0.0 + mouseY * 0.15)
    const heroTargetPosZ = isStacked ? stackedTargetZ : desktopTargetPosZ
    const heroTargetRotX = isStacked ? (0.16 + mouseY * 0.08) : (0.12 + mouseY * 0.15)
    const heroTargetRotY = isStacked ? (0.0 + mouseX * 0.08) : (-0.40 + mouseX * 0.15)
    const heroTargetRotZ = isStacked ? 0.0 : -0.04

    // OLED Darkroom (Scene 2) coordinates:
    // Desktop: Y=0.27, Z=4.40.
    // Mobile portrait (aspect < 0.85): Z=2.45, Y=0.64 to leave clearance for bottom dock
    const stackedDarkroomY = aspect < 0.85 ? 0.64 : 0.54
    const stackedDarkroomZ = aspect < 0.85 ? 2.45 : 3.45
    const darkroomTargetPosY = isStacked ? stackedDarkroomY : 0.27
    const darkroomTargetPosZ = isStacked ? stackedDarkroomZ : 4.40

    let targetRotX = 0.18
    let targetRotY = 0
    let targetRotZ = 0
    let targetPosX = 0
    let targetPosY = INITIAL_CLOSEUP_Y
    let targetPosZ = bootTargetZ
    let _bootProgress = 0

    // Boot trajectory and motion curve:
    const isTargetingScene1 = (showcaseState.activeScene === 1) ||
      (showcaseState.portalPhase === 'closing' && showcaseState.portalTargetScene === 1) ||
      (showcaseState.portalPhase === 'opening' && showcaseState.portalSourceScene === 1)

    if (isTargetingScene1 && (offset > 0.24 || isEnteringScene1)) {
      // Scene 1 Plateau (Hero - Official Flagship):
      // Console holds Hero position throughout Scene 1:
      targetPosX = heroTargetPosX
      targetPosY = heroTargetPosY
      targetPosZ = heroTargetPosZ
      targetRotX = heroTargetRotX
      targetRotY = heroTargetRotY
      targetRotZ = heroTargetRotZ
      _bootProgress = 1.0
    } else if (showcaseState.activeScene === 2 || (showcaseState.portalPhase === 'closing' && showcaseState.portalTargetScene === 2) || (showcaseState.portalPhase === 'opening' && showcaseState.portalSourceScene === 2)) {
      // Scene 2 (OLED Darkroom Showcase): Console centered and stable
      targetPosX = 0.0
      targetPosY = darkroomTargetPosY
      targetPosZ = darkroomTargetPosZ
      targetRotX = 1.131
      targetRotY = 0.0
      targetRotZ = 0.0
      _bootProgress = 1.0
    } else if (showcaseState.activeScene === 3 || showcaseState.activeScene === 4 || showcaseState.activeScene === 5) {
      // Scene 3, 4 & 5: Console hidden
      if (showcaseState.portalTargetScene === 1) {
        targetPosX = heroTargetPosX
        targetPosY = heroTargetPosY
        targetPosZ = heroTargetPosZ
        targetRotX = heroTargetRotX
        targetRotY = heroTargetRotY
        targetRotZ = heroTargetRotZ
      } else {
        targetPosX = 0.0
        targetPosY = darkroomTargetPosY
        targetPosZ = darkroomTargetPosZ
        targetRotX = 1.131
        targetRotY = 0.0
        targetRotZ = 0.0
      }
      _bootProgress = 1.0
    } else if (offset <= 0.10) {
      // Scene 1 Initial Standby: Console closeup
      targetPosX = 0
      targetPosY = INITIAL_CLOSEUP_Y
      targetPosZ = bootTargetZ
      targetRotX = 0.18
      targetRotY = 0
      targetRotZ = 0
      _bootProgress = THREE.MathUtils.lerp(0.0, 0.55, offset / 0.10)
    } else if (offset <= 0.24) {
      // Transition 0 -> 1: Smooth camera liftoff to Hero position
      const progress = (offset - 0.10) / 0.14
      const smoothProg = THREE.MathUtils.smoothstep(progress, 0, 1)
      const dip = Math.sin(smoothProg * Math.PI) * (isStacked ? 0.20 : 0.45)
      targetPosX = THREE.MathUtils.lerp(0, heroTargetPosX, smoothProg)
      targetPosY = THREE.MathUtils.lerp(INITIAL_CLOSEUP_Y, heroTargetPosY, smoothProg) - dip
      targetPosZ = THREE.MathUtils.lerp(bootTargetZ, heroTargetPosZ, smoothProg)
      targetRotX = THREE.MathUtils.lerp(0.18, heroTargetRotX, smoothProg)
      targetRotY = THREE.MathUtils.lerp(0, heroTargetRotY, smoothProg)
      targetRotZ = THREE.MathUtils.lerp(0, heroTargetRotZ, smoothProg)
      _bootProgress = THREE.MathUtils.lerp(0.55, 1.0, progress)
    } else {
      targetPosX = heroTargetPosX
      targetPosY = heroTargetPosY
      targetPosZ = heroTargetPosZ
      targetRotX = heroTargetRotX
      targetRotY = heroTargetRotY
      targetRotZ = heroTargetRotZ
      _bootProgress = 1.0
    }

    // Console visibility and scale: hidden when settled in Scene 3, 4, or 5
    const isSettledInScene3or4or5 = (showcaseState.activeScene === 3 || showcaseState.activeScene === 4 || showcaseState.activeScene === 5) && showcaseState.portalPhase === 'idle'
    const responsiveScale = 15.0
    if (groupRef.current) {
      groupRef.current.scale.setScalar(isSettledInScene3or4or5 ? 0.001 : responsiveScale)
      groupRef.current.visible = !isSettledInScene3or4or5
    }

    // Automatic gameplay video playback management
    const isDarkroom = isScene2Involved
    showcaseState.darkroomMode = isDarkroom
    if (isDarkroom) {
      const currentGame = SHOWCASE_GAMES[showcaseState.activeGameIndex] || SHOWCASE_GAMES[0]
      if (currentGame && (!screenController.isPlaying() || screenController.getCurrentVideoUrl() !== currentGame.videoUrl)) {
        screenController.playVideo(currentGame.videoUrl, false)
      }
    } else {
      if (screenController.isPlaying()) {
        screenController.stopVideo()
      }
    }

    // Darkroom transition progress controlled by scene state
    showcaseState.darkroomProgress = isScene2Involved ? 1 : 0

    // Update dynamic screen canvas texture
    screenController.update(effectiveShaderOffset)

    // Dynamic screen bounce light:
    if ((showcaseState.activeScene === 2 || showcaseState.portalPhase !== 'idle') && showcaseState.darkroomProgress > 0.01) {
      const sample = screenController.getScreenLightSample()
      const dp = showcaseState.darkroomProgress

      // Combine edge luma with average luma for natural response:
      const effectiveLeftLuma = sample.leftLuma * 0.7 + sample.avgLuma * 0.3
      const effectiveRightLuma = sample.rightLuma * 0.7 + sample.avgLuma * 0.3

      // Calibrated subtle bounce light on sticks and buttons (gentle ambient glow, max ~0.45):
      const leftIntensity = (effectiveLeftLuma * 0.45 + Math.pow(sample.avgLuma, 2.0) * 0.15) * dp
      const rightIntensity = (effectiveRightLuma * 0.45 + Math.pow(sample.avgLuma, 2.0) * 0.15) * dp

      leftBounceLight.intensity = THREE.MathUtils.damp(leftBounceLight.intensity, leftIntensity, 8, delta)
      rightBounceLight.intensity = THREE.MathUtils.damp(rightBounceLight.intensity, rightIntensity, 8, delta)

      // Blend edge sample with center for soft diffusion:
      _tempColorL.copy(sample.left).lerp(sample.center, 0.35)
      _tempColorR.copy(sample.right).lerp(sample.center, 0.35)

      leftBounceLight.color.lerp(_tempColorL, THREE.MathUtils.clamp(delta * 10, 0, 1))
      rightBounceLight.color.lerp(_tempColorR, THREE.MathUtils.clamp(delta * 10, 0, 1))
    } else {
      // In Scene 1, disable bounce lights:
      leftBounceLight.intensity = 0
      rightBounceLight.intensity = 0
    }

    // Subtle idle vertical bobbing in Scene 1 (Hero); disabled in Scene 2 (Darkroom)
    const isScene1Active = isTargetingScene1
    const bobAmp = isScene1Active ? THREE.MathUtils.smoothstep(offset, 0.12, 0.24) * 0.05 : 0
    const bobY = Math.sin(state.clock.elapsedTime * 1.5) * bobAmp

    // Instant snap under closed shutters without visible flyover:
    if (showcaseState.snapSteamDeckToScene) {
      groupRef.current.rotation.x = targetRotX
      groupRef.current.rotation.y = targetRotY
      groupRef.current.rotation.z = targetRotZ
      groupRef.current.position.x = targetPosX
      groupRef.current.position.y = targetPosY + bobY
      groupRef.current.position.z = targetPosZ
      groupRef.current.updateMatrixWorld(true)
      showcaseState.snapSteamDeckToScene = false
    } else {
      // Smooth damped interpolation of console position and rotation:
      groupRef.current.rotation.x = THREE.MathUtils.damp(groupRef.current.rotation.x, targetRotX, 4.5, delta)
      groupRef.current.rotation.y = THREE.MathUtils.damp(groupRef.current.rotation.y, targetRotY, 4.5, delta)
      groupRef.current.rotation.z = THREE.MathUtils.damp(groupRef.current.rotation.z, targetRotZ, 4.5, delta)
      groupRef.current.position.x = THREE.MathUtils.damp(groupRef.current.position.x, targetPosX, 4.5, delta)
      groupRef.current.position.y = THREE.MathUtils.damp(groupRef.current.position.y, targetPosY + bobY, 4.5, delta)
      groupRef.current.position.z = THREE.MathUtils.damp(groupRef.current.position.z, targetPosZ, 4.5, delta)
    }

    // Update world position and velocity vector for physics interaction
    groupRef.current.getWorldPosition(_tempWorldPos)
    if (!deckState.initialized) {
      deckState.position.copy(_tempWorldPos)
      deckState.previousPosition.copy(_tempWorldPos)
      deckState.velocity.set(0, 0, 0)
      deckState.initialized = true
    } else {
      deckState.velocity.subVectors(_tempWorldPos, deckState.position)
      deckState.velocity.clampLength(0, 0.35)
      deckState.position.copy(_tempWorldPos)
    }
    deckState.rotation.copy(groupRef.current.rotation)
    if (typeof window !== 'undefined') {
      window.__deckGroup = groupRef.current
      window.__deckWorldPos = _tempWorldPos
    }

    // Project screen coordinates to 2D viewport for OLED / LCD split-screen handle and labels
    const isScene2ProjectionContext = !is1to3or5Portal && (showcaseState.activeScene === 2 || (showcaseState.portalPhase !== 'idle' && (showcaseState.portalSourceScene === 2 || showcaseState.portalTargetScene === 2)))
    if (nodes && nodes.steam_deck_steam_deck_mat03_0 && (offset >= 0.50 || isScene2ProjectionContext)) {
      const mesh = nodes.steam_deck_steam_deck_mat03_0 as THREE.Mesh
      if (typeof window !== 'undefined') {
        window.__deckMesh = mesh
        window.__camera = state.camera
      }
      const BEZEL_MIN_X = 0.048
      const BEZEL_MAX_X = 0.952
      const BEZEL_MIN_Y = 0.038
      const BEZEL_MAX_Y = 0.958

      const rawMinLocalX = -0.08840339
      const rawMaxLocalX = 0.08723613
      const rawMinLocalY = -0.06326957
      const rawMaxLocalY = 0.04444661

      // Active screen area within Steam Deck OLED bezels:
      const minLocalX = rawMinLocalX + BEZEL_MIN_X * (rawMaxLocalX - rawMinLocalX)
      const maxLocalX = rawMinLocalX + BEZEL_MAX_X * (rawMaxLocalX - rawMinLocalX)
      const minLocalY = rawMinLocalY + BEZEL_MIN_Y * (rawMaxLocalY - rawMinLocalY)
      const maxLocalY = rawMinLocalY + BEZEL_MAX_Y * (rawMaxLocalY - rawMinLocalY)

      const splitLocalY = (minLocalY + maxLocalY) / 2

      // Physical screen front plane depth:
      // z(y) ranges from 0.0103346 (bottom) to 0.0098567 (top)
      const frontZ_mid = 0.010095
      const frontZ_top = 0.009857
      const frontZ_bottom = 0.010335

      // Project left and right screen edges at slider height (splitLocalY) with actual Z depth.
      // Accurate Z depth ensures the projected split aligns with shader hairline (< 0.02px deviation).
      _vMidL.set(minLocalX, splitLocalY, frontZ_mid).applyMatrix4(mesh.matrixWorld).project(state.camera)
      _vMidR.set(maxLocalX, splitLocalY, frontZ_mid).applyMatrix4(mesh.matrixWorld).project(state.camera)

      _vCornerTL.set(minLocalX, maxLocalY, frontZ_top).applyMatrix4(mesh.matrixWorld).project(state.camera)
      _vCornerBR.set(maxLocalX, minLocalY, frontZ_bottom).applyMatrix4(mesh.matrixWorld).project(state.camera)

      const splitLocalX = minLocalX + showcaseState.splitPos * (maxLocalX - minLocalX)
      _vScreenSplit.set(splitLocalX, splitLocalY, frontZ_mid).applyMatrix4(mesh.matrixWorld).project(state.camera)

      const midLeft = (_vMidL.x + 1) / 2
      const midRight = (_vMidR.x + 1) / 2
      const top = (1 - _vCornerTL.y) / 2
      const bottom = (1 - _vCornerBR.y) / 2

      const minX = Math.min(midLeft, midRight)
      const maxX = Math.max(midLeft, midRight)
      const minY = Math.min(top, bottom)
      const maxY = Math.max(top, bottom)
      const splitX = Math.max(0, Math.min(1, (_vScreenSplit.x + 1) / 2))
      const splitY = Math.max(0, Math.min(1, (1 - _vScreenSplit.y) / 2))

      showcaseState.setScreenBounds({
        left: minX,
        right: maxX,
        top: minY,
        bottom: maxY,
        width: Math.max(0.01, maxX - minX),
        height: Math.max(0.01, maxY - minY),
        splitX,
        splitY,
      })
    }
  })

  return (
    <group
      ref={groupRef}
      {...props}
      dispose={null}
      scale={15}
      position={[0, INITIAL_CLOSEUP_Y, INITIAL_CLOSEUP_Z]}
      rotation={[0.18, 0, 0]}
    >
      <Center>
        <primitive object={state.scene} />
      </Center>
    </group>
  )
}
