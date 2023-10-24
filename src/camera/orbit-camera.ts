import { ScriptTypeBase } from "../types/ScriptTypeBase";
import { attrib, createScript } from "../utils/createScriptDecorator";

@createScript('orbitCamera')
class OrbitCamera extends ScriptTypeBase {

    static quatWithoutYaw = new pc.Quat();
    static yawOffset = new pc.Quat();
    static distanceBetween = new pc.Vec3();

    @attrib({type: 'boolean', default: true, title: 'Auto Render', description: 'Disable to only render when camera is moving (saves power when the camera is still)'})
    autoRender: boolean;

    @attrib({type: 'number', default: 0, title: 'Distance Max', description: 'Setting this at 0 will give an infinite distance limit'})
    distanceMax: number;

    @attrib({type: 'number', default: 0, title: 'Distance Min'})
    distaneMin: number;

    @attrib({type: 'number', default: 4, title: 'Distance Min'})
    initDistance: number;

    @attrib({type: 'number', default: 90, title: 'Pitch Angle Max (degrees)'})
    pitchAngleMax: number;

    @attrib({type: 'number', default: -90, title: 'Pitch Angle Min (degrees)'})
    pitchAngleMin: number;

    @attrib({type: 'number', default: 0, title: 'Inertia Factor', description: 'Higher value means that the camera will continue moving after the user has stopped dragging. 0 is fully responsive.'})
    inertiaFactor: number;

    @attrib({type: 'entity', title: 'Focus Entity', description: 'Entity for the camera to focus on. If blank, then the camera will use the whole scene'})
    focusEntity: pc.Entity;

    @attrib({type: 'boolean', default: true, title: 'Frame on Start', description: 'Frames the entity or scene at the start of the application."'})
    frameOnStart: boolean;

    _targetDistance: number;
    _targetPitch: number;
    _targetYaw: number;
    _pivotPoint: any;
    _yaw: number;
    _modelsAabb: any;
    private _lastFramePivotPoint: any;
    private distanceMin: number;
    private _pitch: number;
    private _distance: number;
    private _multiframe: any;
    private _autoRenderDefault: boolean;
    private _firstFrame: boolean;
    private _multiframeBusy: boolean;
    private useMultiFrame: boolean;
    private _defaultAutoRender: boolean;
    private duration: number;
    private isInstant: boolean;
    private startPosition: pc.Vec3;
    private endPosition: pc.Vec3 | null;
    private time: number;
    private entityPosition: pc.Vec3 | null;

    constructor() {

        super();
        this._targetDistance = 0;
        this._targetPitch = 0;
        this._targetYaw = 0;
        this._pivotPoint = new pc.Vec3();
    }

    get distance() {
        return this._targetDistance;
    }

    set distance(value) {
        this._targetDistance = this._clampDistance(value);
    }

    get pitch() {
        return this._targetPitch;
    }

    set pitch(value) {
        this._targetPitch = this._clampPitchAngle(value);
    }

    get yaw() {
        return this._targetYaw;
    }

    set yaw(value) {
        this._targetYaw = value;
        var diff = this._targetYaw - this._yaw;
        var reminder = diff % 360;
        if (reminder > 180) {
            this._targetYaw = this._yaw - (360 - reminder);
        } else if (reminder < -180) {
            this._targetYaw = this._yaw + (360 + reminder);
        } else {
            this._targetYaw = this._yaw + reminder;
        }
    }

    get pivotPoint() {
        return this._pivotPoint;
    }

    set pivotPoint(value) {
        this._pivotPoint.copy(value);
    }

    focus(focusEntity: pc.Entity) {
        this._buildAabb(focusEntity, 0);
        var halfExtents = this._modelsAabb.halfExtents;
        var distance = Math.max(halfExtents.x, Math.max(halfExtents.y, halfExtents.z));
        // @ts-ignore
        distance = (distance / Math.tan(0.5 * this.entity.camera.fov * pc.math.DEG_TO_RAD));
        distance = (distance * 2);
        this.distance = distance;
        this._removeInertia();
        this._pivotPoint.copy(this._modelsAabb.center);
    }

    resetAndLookAtPoint(resetPoint:any, lookAtPoint: any) {
        this.pivotPoint.copy(lookAtPoint);
        this.entity.setPosition(resetPoint);
        this.entity.lookAt(lookAtPoint);
        var distance = OrbitCamera.distanceBetween;
        distance.sub2(lookAtPoint, resetPoint);
        this.distance = distance.length();
        this.pivotPoint.copy(lookAtPoint);
        var cameraQuat = this.entity.getRotation();
        this.yaw = this._calcYaw(cameraQuat);
        this.pitch = this._calcPitch(cameraQuat, this.yaw);
        this._removeInertia();
        this._updatePosition();
        if (!this.autoRender) {
            this.app.renderNextFrame = true;
        }
    }

    resetAndLookAtEntity(resetPoint: any, entity: any) {
        this._buildAabb(entity, 0);
        this.resetAndLookAtPoint(resetPoint, this._modelsAabb.center);
    }

    reset(yaw: number, pitch: any, distance: number) {
        this.pitch = pitch;
        this.yaw = yaw;
        this.distance = distance;
        this._removeInertia();
        if (!this.autoRender) {
            this.app.renderNextFrame = true;
        }
    }

    initialize() {
        this._checkAspectRatio();

        // Find all the models in the scene that are under the focused entity
        this._modelsAabb = new pc.BoundingBox();
        this._buildAabb(this.focusEntity || this.app.root, 0);

        this.entity.lookAt(this._modelsAabb.center);

        this._pivotPoint = new pc.Vec3();
        this._pivotPoint.copy(this._modelsAabb.center);
        this._lastFramePivotPoint = this._pivotPoint.clone();

        // Calculate the camera euler angle rotation around x and y axes
        // This allows us to place the camera at a particular rotation to begin with in the scene
        var cameraQuat = this.entity.getRotation();

        // Preset the camera
        this._yaw = this._calcYaw(cameraQuat);
        this._pitch = this._clampPitchAngle(this._calcPitch(cameraQuat, this._yaw));
        this.entity.setLocalEulerAngles(this._pitch, this._yaw, 0);

        this._distance = 0;

        this._targetYaw = this._yaw;
        this._targetPitch = this._pitch;

        // If we have ticked focus on start, then attempt to position the camera where it frames
        // the focused entity and move the pivot point to entity's position otherwise, set the distance
        // to be between the camera position in the scene and the pivot point
        if (this.frameOnStart) {
            this.focus(this.focusEntity || this.app.root);
        } else {
            var distanceBetween = new pc.Vec3();
            distanceBetween.sub2(this.entity.getPosition(), this._pivotPoint);
            this._distance = this._clampDistance(distanceBetween.length());
        }

        this._targetDistance = this._distance;

        this._autoRenderDefault = this.app.autoRender;
        this._firstFrame = true;

        // Do not enable autoRender if it's already off as it's controlled elsewhere
        if (this.app.autoRender) {
            this.app.autoRender = this.autoRender;
        }

        if (!this.autoRender) {
            this.app.renderNextFrame = true;
        }

        this._multiframeBusy = false;

        if (this.useMultiFrame) {
            // @ts-ignore
            this._multiframe = new Multiframe(this.app.graphicsDevice, this.entity.camera, 5);
        }

        this.on?.('attr:autoRender', (value, prev) => {
            this.app.autoRender = value;
            if (!this.autoRender) {
                this.app.renderNextFrame = true;
            }
        }, this);

        // Reapply the clamps if they are changed in the editor
        this.on?.('attr:distanceMin',  (value, prev) => {
            this._targetDistance = this._clampDistance(this._distance);
        }, this);

        this.on?.('attr:distanceMax',  (value, prev) => {
            this._targetDistance = this._clampDistance(this._distance);
        }, this);

        this.on?.('attr:pitchAngleMin',  (value, prev) => {
            this._targetPitch = this._clampPitchAngle(this._pitch);
        }, this);

        this.on?.('attr:pitchAngleMax', (value, prev) =>  {
            this._targetPitch = this._clampPitchAngle(this._pitch);
        }, this);

        // Focus on the entity if we change the focus entity
        this.on?.('attr:focusEntity', (value, prev) => {
            if (this.frameOnStart) {
                this.focus(value || this.app.root);
            } else {
                this.resetAndLookAtEntity(this.entity.getPosition(), value || this.app.root);
            }
        }, this);

        this.on?.('attr:frameOnStart',  (value, prev) => {
            if (value) {
                this.focus(this.focusEntity || this.app.root);
            }
        }, this);

        const onResizeCanvas =  () =>  {
            if (!this._multiframe) {
                return;
            }

            /** @type {pc.GraphicsDevice} */
            var device = this.app.graphicsDevice;
            var canvasSize = { width: device.canvas.width / device.maxPixelRatio, height: device.height / device.maxPixelRatio };

            if (!this.autoRender) {
                this.app.renderNextFrame = true;
            }

            this._multiframe.moved();

            var createTexture = (width: number, height: number, format: number) => {
                return new pc.Texture(device, {
                    width: width,
                    height: height,
                    format: format,
                    mipmaps: false,
                    minFilter: pc.FILTER_NEAREST,
                    magFilter: pc.FILTER_NEAREST,
                    addressU: pc.ADDRESS_CLAMP_TO_EDGE,
                    addressV: pc.ADDRESS_CLAMP_TO_EDGE
                });
            };

            // out with the old
            const old = this.entity.camera?.renderTarget;

            if (old) {
                old.colorBuffer.destroy();
                // console.log(old.depthBuffer);
                if(old.depthBuffer) {
                    old.depthBuffer.destroy();
                }

                old.destroy();
            }

            // in with the new
            const w = canvasSize.width;
            const h = canvasSize.height;
            const colorBuffer = createTexture(w, h, pc.PIXELFORMAT_R8_G8_B8_A8);
            const depthBuffer = createTexture(w, h, pc.PIXELFORMAT_DEPTH);
            // @ts-ignore
            const maxSamples = device.maxSamples;
            const renderTarget = new pc.RenderTarget({
                colorBuffer: colorBuffer,
                depthBuffer: depthBuffer,
                flipY: false,
                samples: maxSamples
            });

            // @ts-ignore
            this.entity.camera.renderTarget = renderTarget;

            this._checkAspectRatio();
            if (!this.autoRender) {
                this.app.renderNextFrame = true;
            }
        };

        const onPostRender = () => {
            if (this._multiframe) {
                this._multiframeBusy = this._multiframe.update();
            }
        };

        const onFrameEnd = () => {
            if (this._firstFrame) {
                this._firstFrame = false;
                if (!this.autoRender) {
                    this.app.renderNextFrame = true;
                }
            }

            if (this._multiframeBusy && !this.autoRender) {
                this.app.renderNextFrame = true;
            }
        };

        this.app.graphicsDevice.on('resizecanvas', onResizeCanvas, this);
        this.app.on('postrender', onPostRender, this);
        this.app.on('frameend', onFrameEnd, this);

        this.on?.('destroy', () => {
            this.app.graphicsDevice.off('resizecanvas', onResizeCanvas, this);
            this.app.off('postrender', onPostRender, this);
            this.app.off('frameend', onFrameEnd, this);
            this.app.autoRender = this._defaultAutoRender;

            var renderTarget = this.entity.camera && this.entity.camera.renderTarget;
            if (renderTarget) {
                // @ts-ignore
                this.entity.camera.renderTarget = null;
                renderTarget.destroy();
            }
        }, this);

        this.duration = 5;
        this.isInstant = false;
        this.app.on("camera:transition", (position, isInstant = false) => {

            this.isInstant = isInstant;
            var target = position;
            this.startPosition = this.entity.getPosition();
            this.endPosition = new pc.Vec3(target.x, target.y, target.z);
            this.time = 0;
        });

        this.app.on('camera:zoom:reset', (existingDistance) => {

            // @ts-ignore
            this.entity.camera.fov = 25;
            this.distance = existingDistance ? existingDistance : this.initDistance;
            this.app.fire('clearMultiFrame');

        });

        this._distance = this.initDistance;
        this._targetDistance = this.initDistance;

        setTimeout(()=>{
            this.app.fire('clearMultiFrame');
        },200)

        onResizeCanvas.call(this);
    }

    update(dt: number) {
        console.log("Pivot Point : ", this.pivotPoint);
        const distanceDiff = Math.abs(this._targetDistance - this._distance);
        const yawDiff = Math.abs(this._targetYaw - this._yaw);
        const pitchDiff = Math.abs(this._targetPitch - this._pitch);
        const pivotDiff = this.pivotPoint.distance(this._lastFramePivotPoint);

        const moved = distanceDiff > 0.001 || yawDiff > 0.01 || pitchDiff > 0.01 || pivotDiff > 0.001;
        if (!this.autoRender) {
            this.app.renderNextFrame = moved || this.app.renderNextFrame;
        }

        // Add inertia, if any
        const t = this.inertiaFactor === 0 ? 1 : Math.min(dt / this.inertiaFactor, 1);
        this._distance = pc.math.lerp(this._distance, this._targetDistance, t);
        this._yaw = pc.math.lerp(this._yaw, this._targetYaw, t);
        this._pitch = pc.math.lerp(this._pitch, this._targetPitch, t);
        this._lastFramePivotPoint.copy(this.pivotPoint);
        if (this.startPosition && this.endPosition) {

            if (this.isInstant === false) {
                this.time += (dt  /10);
                if (this.time > this.duration) {
                    this.time -= this.duration;
                }

                const alpha = this.time / this.duration;
                this.entityPosition = this.entity.getPosition();

                this.entityPosition.lerp(this.startPosition, this.endPosition, alpha);

                if(Math.round(this.endPosition.x * 10)/100  === Math.round(this.entityPosition.x *10 )/100
                    && Math.round(this.endPosition.y *10)/100 === Math.round( this.entityPosition.y *10)/100
                    && Math.round(this.endPosition.z * 10 ) / 100 === Math.round(this.entityPosition.z * 10) / 100) {
                    // console.log('Transition Completed',this.endPosition, this.entity.getRotation().getEulerAngles(), this.entity.pivotPoint);

                    this.endPosition = null;

                } else {
                    this.resetAndLookAtPoint(this.entityPosition, this.pivotPoint);
                }
            } else {
                this.entityPosition = this.endPosition;
                this.resetAndLookAtPoint(this.endPosition, this.pivotPoint);
                this.endPosition = null;
            }

            // if (moved && this._multiframe) {
            //     this._multiframe.moved();
            this.app.fire('clearMultiFrame');
            // }
        } else {
            // console.log("orbit : ", this.entity.getPosition());

            this._updatePosition();



            // this.resetAndLookAtPoint(this.entity.getPosition(), this.pivotPoint);
        }

        if (moved && this._multiframe) {
            // console.log(moved,this._multiframe);
            this._multiframe.moved();

        }
    }

    _updatePosition() {
        this.entity.setLocalPosition(0, 0, 0);
        this.entity.setLocalEulerAngles(this._pitch, this._yaw, 0);
        const position = this.entity.getPosition();
        position.copy(this.entity.forward);
        // @ts-ignore
        position.scale(-this._distance);
        position.add(this.pivotPoint);
        this.entity.setPosition(position);
    }

    _removeInertia() {
        this._yaw = this._targetYaw;
        this._pitch = this._targetPitch;
        this._distance = this._targetDistance;
    }

    _checkAspectRatio() {
        var height = this.app.graphicsDevice.height;
        var width = this.app.graphicsDevice.width;
        // @ts-ignore
        this.entity.camera.horizontalFov = height > width;
    }

    _buildAabb(entity: pc.Entity, modelsAdded: any) {
        var i = 0, j = 0, meshInstances;
        if (entity instanceof pc.Entity) {
            var allMeshInstances = [];
            var renders = entity.findComponents('render');
            for (i = 0; i < renders.length; ++i) {
                // @ts-ignore
                meshInstances = renders[i].meshInstances;
                if (meshInstances) {
                    for (j = 0; j < meshInstances.length; j++) {
                        allMeshInstances.push(meshInstances[j]);
                    }
                }
            }
            var models = entity.findComponents('model');
            for (i = 0; i < models.length; ++i) {
                // @ts-ignore
                meshInstances = models[i].meshInstances;
                if (meshInstances) {
                    for (j = 0; j < meshInstances.length; j++) {
                        allMeshInstances.push(meshInstances[j]);
                    }
                }
            }
            for (i = 0; i < allMeshInstances.length; i++) {
                if (modelsAdded === 0) {
                    this._modelsAabb.copy(allMeshInstances[i].aabb);
                } else {
                    this._modelsAabb.add(allMeshInstances[i].aabb);
                }
                modelsAdded += 1;
            }
        }
        for (i = 0; i < entity.children.length; ++i) {
            // @ts-ignore
            modelsAdded += this._buildAabb(entity.children[i], modelsAdded);
        }
        return modelsAdded;
    }

    _calcYaw(quat: pc.Quat) {
        var transformedForward = new pc.Vec3();
        quat.transformVector(pc.Vec3.FORWARD, transformedForward);
        return Math.atan2(-transformedForward.x, -transformedForward.z) * pc.math.RAD_TO_DEG;
    }

    _clampDistance(distance: number) {
        if (this.distanceMax > 0) {
            return pc.math.clamp(distance, this.distanceMin, this.distanceMax);
        } else {
            return Math.max(distance, this.distanceMin);
        }
    }

    _clampPitchAngle(pitch: number) {
        return pc.math.clamp(pitch, -this.pitchAngleMax, -this.pitchAngleMin);
    }


    _calcPitch(quat: pc.Quat, yaw: number) {
        var quatWithoutYaw = OrbitCamera.quatWithoutYaw;
        var yawOffset = OrbitCamera.yawOffset;
        yawOffset.setFromEulerAngles(0, -yaw, 0);
        quatWithoutYaw.mul2(yawOffset, quat);
        var transformedForward = new pc.Vec3();
        quatWithoutYaw.transformVector(pc.Vec3.FORWARD, transformedForward);
        return Math.atan2(transformedForward.y, -transformedForward.z) * pc.math.RAD_TO_DEG;
    }
}
export default OrbitCamera;
