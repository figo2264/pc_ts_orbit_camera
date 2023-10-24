import {ScriptTypeBase} from "../types/ScriptTypeBase";
import {attrib, createScript} from "../utils/createScriptDecorator";

@createScript('mouseInput')
class MouseInput extends ScriptTypeBase {

    @attrib({type:'boolean',title:'Free Camera', default:false})
    freeCamera: boolean;

    @attrib({type:'number',title:'Orbit Sensitivity', default:0.3})
    orbitSensitivity: number;

    @attrib({type:'number',title:'Distance Sensitivity', default:0.15})
    distanceSensitivity: number;

    fromWorldPoint = new pc.Vec3();
    toWorldPoint = new pc.Vec3();
    worldDiff = new pc.Vec3();

    orbitCamera: any;
    lookCamera: any;
    lookCameraMinFov: number;
    lookCameraMaxFov: number;

    lookButtonDown: boolean;
    panButtonDown: boolean;
    lastPoint: pc.Vec2;

// initialize code called once per entity
    private static fromWorldPoint: pc.Vec3;
    private static toWorldPoint: pc.Vec3;
    private static worldDiff: any;
    initialize () {

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        this.orbitCamera = this.entity.script.orbitCamera;

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        this.lookCamera = this.entity.script.lookCamera;

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        this.lookCameraMinFov = this.entity.camera.fov / 2;
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        this.lookCameraMaxFov = this.entity.camera.fov;

        if (this.orbitCamera) {

            const onMouseOut = (e: any) => {
                this.onMouseOut(e);
            };

            this.app.mouse.on(pc.EVENT_MOUSEDOWN, this.onMouseDown, this);
            this.app.mouse.on(pc.EVENT_MOUSEUP, this.onMouseUp, this);
            this.app.mouse.on(pc.EVENT_MOUSEMOVE, this.onMouseMove, this);
            this.app.mouse.on(pc.EVENT_MOUSEWHEEL, this.onMouseWheel, this);

            // Listen to when the mouse travels out of the window
            window.addEventListener('mouseout', onMouseOut, false);

            // Remove the listeners so if this entity is destroyed
            this.on?.('destroy', () => {
                this.app.mouse.off(pc.EVENT_MOUSEDOWN, this.onMouseDown, this);
                this.app.mouse.off(pc.EVENT_MOUSEUP, this.onMouseUp, this);
                this.app.mouse.off(pc.EVENT_MOUSEMOVE, this.onMouseMove, this);
                this.app.mouse.off(pc.EVENT_MOUSEWHEEL, this.onMouseWheel, this);

                window.removeEventListener('mouseout', onMouseOut, false);
            });
        }

        // Disabling the context menu stops the browser displaying a menu when
        // you right-click the page
        this.app.mouse.disableContextMenu();

        this.lookButtonDown = false;
        this.panButtonDown = false;
        this.lastPoint = new pc.Vec2();
    };




    pan (screenPoint:any) {

        const fromWorldPoint = MouseInput.fromWorldPoint;
        const toWorldPoint = MouseInput.toWorldPoint;
        const worldDiff = MouseInput.worldDiff;

        // For panning to work at any zoom level, we use screen point to world projection
        // to work out how far we need to pan the pivotEntity in world space
        const camera = this.entity.camera;
        const distance = this.orbitCamera.distance;

        // console.log(this.lastPoint.x,this.lastPoint.y);
        camera?.screenToWorld(screenPoint.x, screenPoint.y, distance, fromWorldPoint);
        camera?.screenToWorld(this.lastPoint.x, this.lastPoint.y, distance, toWorldPoint);

        worldDiff.sub2(toWorldPoint, fromWorldPoint);
        this.orbitCamera.pivotPoint.add(worldDiff);
    };


    onMouseDown  (event:any) {
        this.app.fire('start:action',"mouse");
        switch (event.button) {
            case pc.MOUSEBUTTON_LEFT: {
                this.lookButtonDown = true;
            } break;

            case pc.MOUSEBUTTON_MIDDLE:
            case pc.MOUSEBUTTON_RIGHT: {
                this.panButtonDown = this.freeCamera;

            } break;
        }
    };


    onMouseUp  (event: any) {
        this.app.fire('end:action',"mouse end");
        switch (event.button) {
            case pc.MOUSEBUTTON_LEFT: {
                this.lookButtonDown = false;
            } break;

            case pc.MOUSEBUTTON_MIDDLE:
            case pc.MOUSEBUTTON_RIGHT: {
                if(this.freeCamera){
                    this.panButtonDown = false;
                }
            } break;
        }
    };


    onMouseMove  (event: any) {

        const mouse = pc.app.mouse;
        if (this.lookButtonDown) {
            if(this.orbitCamera.enabled){
                this.orbitCamera.pitch -= event.dy * this.orbitSensitivity;
                this.orbitCamera.yaw -= event.dx * this.orbitSensitivity;
            }


        } else if (this.panButtonDown) {
            this.pan(event);
        }

        this.lastPoint.set(event.x, event.y);
    };


    onMouseWheel (event: any) {
        this.app.fire('start:action',"wheel");
        // console.log('Mouse Wheel Event : ', event);
        if(this.orbitCamera.enabled && this.lookCamera.enabled === false){
            this.orbitCamera.distance -= event.wheel * this.distanceSensitivity * (this.orbitCamera.distance * 0.1);
        } else if (this.orbitCamera.enabled === false && this.lookCamera.enabled) {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            this.app.fire("camera:zoom", event.wheel * (this.distanceSensitivity/2) * (this.entity.camera.fov * 0.07));
        }
        setTimeout(()=>{
            this.app.fire('end:action',"wheel");
        },500)

        event.event.preventDefault();
    };


    onMouseOut  (event: any) {
        this.lookButtonDown = false;
        this.panButtonDown = false;

    };
}
export default MouseInput;
// pc.registerScript(MouseInput, 'mouseInput');
//
// MouseInput.attributes.add('orbitSensitivity', {
//     type: 'number',
//     default: 0.3,
//     title: 'Orbit Sensitivity',
//     description: 'How fast the camera moves around the orbit. Higher is faster'
// });
//
// MouseInput.attributes.add('distanceSensitivity', {
//     type: 'number',
//     default: 0.15,
//     title: 'Distance Sensitivity',
//     description: 'How fast the camera moves in and out. Higher is faster'
// });
//
// MouseInput.attributes.add('freeCamera', {
//     type: 'boolean',
//     default: false,
//     title: 'Toggle Free Camera'
// });
