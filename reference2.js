"use strict";
(self["SRWP-sir-buildingblocks"] = self["SRWP-sir-buildingblocks"] || []).push([
  [14866],
  {
    414866: function (t, e, n) {
      var i =
        Object.assign ||
        function (t) {
          for (var e = 1; e < arguments.length; e++) {
            var n = arguments[e];
            for (var i in n) {
              if (Object.prototype.hasOwnProperty.call(n, i)) {
                t[i] = n[i];
              }
            }
          }
          return t;
        };
      function r(t, e) {
        if (typeof e !== "function" && e !== null) {
          throw new TypeError(
            "Super expression must either be null or a function, not " +
              typeof e,
          );
        }
        t.prototype = Object.create(e && e.prototype, {
          constructor: {
            value: t,
            enumerable: false,
            writable: true,
            configurable: true,
          },
        });
        if (e)
          Object.setPrototypeOf
            ? Object.setPrototypeOf(t, e)
            : (t.__proto__ = e);
      }
      function o(t, e) {
        if (!(t instanceof e)) {
          throw new TypeError("Cannot call a class as a function");
        }
      }
      var a = n(970076);
      var s = n(296540);
      var u = n(21849);
      var f = n(648882);
      var h = n(258061);
      var c = n(773703);
      var l = n(975024);
      var _ = (function () {
        function t() {
          o(this, t);
        }
        t.prototype.__attach = function t() {};
        t.prototype.__detach = function t() {};
        t.prototype.__getValue = function t() {};
        t.prototype.__getAnimatedValue = function t() {
          return this.__getValue();
        };
        t.prototype.__addChild = function t(e) {};
        t.prototype.__removeChild = function t(e) {};
        t.prototype.__getChildren = function t() {
          return [];
        };
        return t;
      })();
      var p = (function () {
        function t() {
          o(this, t);
        }
        t.prototype.start = function t(e, n, i, r) {};
        t.prototype.stop = function t() {};
        t.prototype.__debouncedOnEnd = function t(e) {
          var n = this.__onEnd;
          this.__onEnd = null;
          n && n(e);
        };
        return t;
      })();
      var d = (function (t) {
        r(e, t);
        function e() {
          o(this, e);
          t.call(this);
          this._children = [];
        }
        e.prototype.__addChild = function t(e) {
          if (this._children.length === 0) {
            this.__attach();
          }
          this._children.push(e);
        };
        e.prototype.__removeChild = function t(e) {
          var n = this._children.indexOf(e);
          if (n === -1) {
            console.warn("Trying to remove a child that doesn't exist");
            return;
          }
          this._children.splice(n, 1);
          if (this._children.length === 0) {
            this.__detach();
          }
        };
        e.prototype.__getChildren = function t() {
          return this._children;
        };
        return e;
      })(_);
      function v(t) {
        var e = new u();
        function n(t) {
          if (typeof t.update === "function") {
            e.add(t);
          } else {
            t.__getChildren().forEach(n);
          }
        }
        n(t);
        e.forEach(function (t) {
          return t.update();
        });
      }
      var m = a.inOut(a.ease);
      var y = (function (t) {
        r(e, t);
        function e(n) {
          o(this, e);
          t.call(this);
          this._toValue = n.toValue;
          this._easing = n.easing !== undefined ? n.easing : m;
          this._duration = n.duration !== undefined ? n.duration : 500;
          this._delay = n.delay !== undefined ? n.delay : 0;
          this.__isInteraction =
            n.isInteraction !== undefined ? n.isInteraction : true;
        }
        e.prototype.start = function t(e, n, i) {
          var r = this;
          this.__active = true;
          this._fromValue = e;
          this._onUpdate = n;
          this.__onEnd = i;
          var t = function t() {
            if (r._duration === 0) {
              r._onUpdate(r._toValue);
              r.__debouncedOnEnd({
                finished: true,
              });
            } else {
              r._startTime = Date.now();
              r._animationFrame = c(r.onUpdate.bind(r));
            }
          };
          if (this._delay) {
            this._timeout = setTimeout(t, this._delay);
          } else {
            t();
          }
        };
        e.prototype.onUpdate = function t() {
          var e = Date.now();
          if (e >= this._startTime + this._duration) {
            if (this._duration === 0) {
              this._onUpdate(this._toValue);
            } else {
              this._onUpdate(
                this._fromValue +
                  this._easing(1) * (this._toValue - this._fromValue),
              );
            }
            this.__debouncedOnEnd({
              finished: true,
            });
            return;
          }
          this._onUpdate(
            this._fromValue +
              this._easing((e - this._startTime) / this._duration) *
                (this._toValue - this._fromValue),
          );
          if (this.__active) {
            this._animationFrame = c(this.onUpdate.bind(this));
          }
        };
        e.prototype.stop = function t() {
          this.__active = false;
          clearTimeout(this._timeout);
          l(this._animationFrame);
          this.__debouncedOnEnd({
            finished: false,
          });
        };
        return e;
      })(p);
      var g = (function (t) {
        r(e, t);
        function e(n) {
          o(this, e);
          t.call(this);
          this._deceleration =
            n.deceleration !== undefined ? n.deceleration : 0.998;
          this._velocity = n.velocity;
          this.__isInteraction =
            n.isInteraction !== undefined ? n.isInteraction : true;
        }
        e.prototype.start = function t(e, n, i) {
          this.__active = true;
          this._lastValue = e;
          this._fromValue = e;
          this._onUpdate = n;
          this.__onEnd = i;
          this._startTime = Date.now();
          this._animationFrame = c(this.onUpdate.bind(this));
        };
        e.prototype.onUpdate = function t() {
          var e = Date.now();
          var n =
            this._fromValue +
            (this._velocity / (1 - this._deceleration)) *
              (1 - Math.exp(-(1 - this._deceleration) * (e - this._startTime)));
          this._onUpdate(n);
          if (Math.abs(this._lastValue - n) < 0.1) {
            this.__debouncedOnEnd({
              finished: true,
            });
            return;
          }
          this._lastValue = n;
          if (this.__active) {
            this._animationFrame = c(this.onUpdate.bind(this));
          }
        };
        e.prototype.stop = function t() {
          this.__active = false;
          l(this._animationFrame);
          this.__debouncedOnEnd({
            finished: false,
          });
        };
        return e;
      })(p);
      function V(t, e) {
        if (t === undefined || t === null) {
          return e;
        }
        return t;
      }
      var b = (function (t) {
        r(e, t);
        function e(n) {
          o(this, e);
          t.call(this);
          this._overshootClamping = V(n.overshootClamping, false);
          this._restDisplacementThreshold = V(
            n.restDisplacementThreshold,
            0.001,
          );
          this._restSpeedThreshold = V(n.restSpeedThreshold, 0.001);
          this._initialVelocity = n.velocity;
          this._lastVelocity = V(n.velocity, 0);
          this._toValue = n.toValue;
          this.__isInteraction =
            n.isInteraction !== undefined ? n.isInteraction : true;
          var i;
          if (n.bounciness !== undefined || n.speed !== undefined) {
            !(n.tension === undefined && n.friction === undefined)
              ? false
                ? 0
                : h(false)
              : undefined;
            i = f.fromBouncinessAndSpeed(V(n.bounciness, 8), V(n.speed, 12));
          } else {
            i = f.fromOrigamiTensionAndFriction(
              V(n.tension, 40),
              V(n.friction, 7),
            );
          }
          this._tension = i.tension;
          this._friction = i.friction;
        }
        e.prototype.start = function t(n, i, r, o) {
          this.__active = true;
          this._startPosition = n;
          this._lastPosition = this._startPosition;
          this._onUpdate = i;
          this.__onEnd = r;
          this._lastTime = Date.now();
          if (o instanceof e) {
            var a = o.getInternalState();
            this._lastPosition = a.lastPosition;
            this._lastVelocity = a.lastVelocity;
            this._lastTime = a.lastTime;
          }
          if (
            this._initialVelocity !== undefined &&
            this._initialVelocity !== null
          ) {
            this._lastVelocity = this._initialVelocity;
          }
          this.onUpdate();
        };
        e.prototype.getInternalState = function t() {
          return {
            lastPosition: this._lastPosition,
            lastVelocity: this._lastVelocity,
            lastTime: this._lastTime,
          };
        };
        e.prototype.onUpdate = function t() {
          var e = this._lastPosition;
          var n = this._lastVelocity;
          var i = this._lastPosition;
          var r = this._lastVelocity;
          var o = 64;
          var a = Date.now();
          if (a > this._lastTime + o) {
            a = this._lastTime + o;
          }
          var s = 1;
          var u = Math.floor((a - this._lastTime) / s);
          for (var f = 0; f < u; ++f) {
            var h = s / 1e3;
            var l = n;
            var _ = this._tension * (this._toValue - i) - this._friction * r;
            var i = e + (l * h) / 2;
            var r = n + (_ * h) / 2;
            var p = r;
            var d = this._tension * (this._toValue - i) - this._friction * r;
            i = e + (p * h) / 2;
            r = n + (d * h) / 2;
            var v = r;
            var m = this._tension * (this._toValue - i) - this._friction * r;
            i = e + (v * h) / 2;
            r = n + (m * h) / 2;
            var y = r;
            var g = this._tension * (this._toValue - i) - this._friction * r;
            i = e + (v * h) / 2;
            r = n + (m * h) / 2;
            var V = (l + 2 * (p + v) + y) / 6;
            var b = (_ + 2 * (d + m) + g) / 6;
            e += V * h;
            n += b * h;
          }
          this._lastTime = a;
          this._lastPosition = e;
          this._lastVelocity = n;
          this._onUpdate(e);
          if (!this.__active) {
            return;
          }
          var w = false;
          if (this._overshootClamping && this._tension !== 0) {
            if (this._startPosition < this._toValue) {
              w = e > this._toValue;
            } else {
              w = e < this._toValue;
            }
          }
          var x = Math.abs(n) <= this._restSpeedThreshold;
          var k = true;
          if (this._tension !== 0) {
            k = Math.abs(this._toValue - e) <= this._restDisplacementThreshold;
          }
          if (w || (x && k)) {
            if (this._tension !== 0) {
              this._onUpdate(this._toValue);
            }
            this.__debouncedOnEnd({
              finished: true,
            });
            return;
          }
          this._animationFrame = c(this.onUpdate.bind(this));
        };
        e.prototype.stop = function t() {
          this.__active = false;
          l(this._animationFrame);
          this.__debouncedOnEnd({
            finished: false,
          });
        };
        return e;
      })(p);
      var w = 1;
      var x = (function (t) {
        r(e, t);
        function e(n) {
          o(this, e);
          t.call(this);
          this._value = n;
          this._offset = 0;
          this._animation = null;
          this._listeners = {};
        }
        e.prototype.__detach = function t() {
          this.stopAnimation();
        };
        e.prototype.__getValue = function t() {
          return this._value + this._offset;
        };
        e.prototype.setValue = function t(e) {
          if (this._animation) {
            this._animation.stop();
            this._animation = null;
          }
          this._updateValue(e);
        };
        e.prototype.setOffset = function t(e) {
          this._offset = e;
        };
        e.prototype.flattenOffset = function t() {
          this._value += this._offset;
          this._offset = 0;
        };
        e.prototype.addListener = function t(e) {
          var n = String(w++);
          this._listeners[n] = e;
          return n;
        };
        e.prototype.removeListener = function t(e) {
          delete this._listeners[e];
        };
        e.prototype.removeAllListeners = function t() {
          this._listeners = {};
        };
        e.prototype.stopAnimation = function t(e) {
          this.stopTracking();
          this._animation && this._animation.stop();
          this._animation = null;
          e && e(this.__getValue());
        };
        e.prototype.format = function t(e) {
          return new A(this, e);
        };
        e.prototype.animate = function t(e, n) {
          var i = this;
          var r = null;
          var o = this._animation;
          this._animation && this._animation.stop();
          this._animation = e;
          e.start(
            this._value,
            function (t) {
              i._updateValue(t);
            },
            function (t) {
              i._animation = null;
              n && n(t);
            },
            o,
          );
        };
        e.prototype.stopTracking = function t() {
          this._tracking && this._tracking.__detach();
          this._tracking = null;
        };
        e.prototype.track = function t(e) {
          this.stopTracking();
          this._tracking = e;
        };
        e.prototype._updateValue = function t(e) {
          this._value = e;
          v(this);
          for (var n in this._listeners) {
            this._listeners[n]({
              value: this.__getValue(),
            });
          }
        };
        return e;
      })(d);
      var k = (function (t) {
        r(e, t);
        function e(n) {
          o(this, e);
          t.call(this);
          var i = n || {
            x: 0,
            y: 0,
          };
          if (typeof i.x === "number" && typeof i.y === "number") {
            this.x = new x(i.x);
            this.y = new x(i.y);
          } else {
            !(i.x instanceof x && i.y instanceof x)
              ? false
                ? 0
                : h(false)
              : undefined;
            this.x = i.x;
            this.y = i.y;
          }
          this._listeners = {};
        }
        e.prototype.setValue = function t(e) {
          this.x.setValue(e.x);
          this.y.setValue(e.y);
        };
        e.prototype.setOffset = function t(e) {
          this.x.setOffset(e.x);
          this.y.setOffset(e.y);
        };
        e.prototype.flattenOffset = function t() {
          this.x.flattenOffset();
          this.y.flattenOffset();
        };
        e.prototype.__getValue = function t() {
          return {
            x: this.x.__getValue(),
            y: this.y.__getValue(),
          };
        };
        e.prototype.stopAnimation = function t(e) {
          this.x.stopAnimation();
          this.y.stopAnimation();
          e && e(this.__getValue());
        };
        e.prototype.addListener = function t(e) {
          var n = this;
          var i = String(w++);
          var r = function t(i) {
            var r = i.value;
            e(n.__getValue());
          };
          this._listeners[i] = {
            x: this.x.addListener(r),
            y: this.y.addListener(r),
          };
          return i;
        };
        e.prototype.removeListener = function t(e) {
          this.x.removeListener(this._listeners[e].x);
          this.y.removeListener(this._listeners[e].y);
          delete this._listeners[e];
        };
        e.prototype.getLayout = function t() {
          return {
            left: this.x,
            top: this.y,
          };
        };
        e.prototype.getTranslateTransform = function t() {
          return [
            {
              translateX: this.x,
            },
            {
              translateY: this.y,
            },
          ];
        };
        return e;
      })(d);
      var A = (function (t) {
        r(e, t);
        function e(n, i) {
          o(this, e);
          t.call(this);
          this._parent = n;
          this._formatter = i;
        }
        e.prototype.__getValue = function t() {
          var e = this._parent.__getValue();
          return this._formatter(e);
        };
        e.prototype.__attach = function t() {
          this._parent.__addChild(this);
        };
        e.prototype.__detach = function t() {
          this._parent.__removeChild(this);
        };
        e.prototype.format = function t(n) {
          return new e(this, n);
        };
        return e;
      })(d);
      var C = (function (t) {
        r(e, t);
        function e(n, i) {
          o(this, e);
          t.call(this);
          this._a = n;
          this._b = i;
        }
        e.prototype.__getValue = function t() {
          return this._a.__getValue() + this._b.__getValue();
        };
        e.prototype.__attach = function t() {
          this._a.__addChild(this);
          this._b.__addChild(this);
        };
        e.prototype.__detach = function t() {
          this._a.__removeChild(this);
          this._b.__removeChild(this);
        };
        return e;
      })(d);
      var T = (function (t) {
        r(e, t);
        function e(n, i) {
          o(this, e);
          t.call(this);
          this._a = n;
          this._b = i;
        }
        e.prototype.__getValue = function t() {
          return this._a.__getValue() * this._b.__getValue();
        };
        e.prototype.__attach = function t() {
          this._a.__addChild(this);
          this._b.__addChild(this);
        };
        e.prototype.__detach = function t() {
          this._a.__removeChild(this);
          this._b.__removeChild(this);
        };
        return e;
      })(d);
      var O = (function (t) {
        r(e, t);
        function e(n) {
          o(this, e);
          t.call(this);
          this._list = n;
        }
        e.prototype.__getValue = function t() {
          return this._list.map(function (t) {
            if (t instanceof _) {
              return t.__getValue();
            } else {
              return t;
            }
          });
        };
        e.prototype.__getAnimatedValue = function t() {
          return this.__getValue();
        };
        e.prototype.__attach = function t() {
          var e = this;
          this._list.forEach(function (t) {
            if (t instanceof _) {
              return t.__addChild(e);
            }
          });
        };
        e.prototype.__detach = function t() {
          var e = this;
          this._list.forEach(function (t) {
            if (t instanceof _) {
              return t.__removeChild(e);
            }
          });
        };
        e.prototype.format = function t(e) {
          return new A(this, e);
        };
        return e;
      })(d);
      var E = (function (t) {
        r(e, t);
        function e(n) {
          o(this, e);
          t.call(this);
          if (n instanceof _) {
            this._transforms = n;
            this._single = true;
          } else {
            this._transforms = n.map(function (t) {
              var e = {};
              for (var n in t) {
                var i = t[n];
                if (i instanceof Array) {
                  e[n] = new O(i);
                } else {
                  e[n] = i;
                }
              }
              return e;
            });
            this._single = false;
          }
        }
        e.prototype.__getValue = function t() {
          if (this._single) {
            return this._transforms.__getValue();
          } else {
            return this._transforms.map(function (t) {
              var e = {};
              for (var n in t) {
                var i = t[n];
                if (i instanceof _) {
                  e[n] = i.__getValue();
                } else {
                  e[n] = i;
                }
              }
              return e;
            });
          }
        };
        e.prototype.__getAnimatedValue = function t() {
          return this.__getValue();
        };
        e.prototype.__attach = function t() {
          var e = this;
          if (this._single) {
            this._transforms.__addChild(this);
          } else {
            this._transforms.forEach(function (t) {
              for (var n in t) {
                var i = t[n];
                if (i instanceof _) {
                  i.__addChild(e);
                }
              }
            });
          }
        };
        e.prototype.__detach = function t() {
          var e = this;
          if (this._single) {
            this._transforms.__removeChild(this);
          } else {
            this._transforms.forEach(function (t) {
              for (var n in t) {
                var i = t[n];
                if (i instanceof _) {
                  i.__removeChild(e);
                }
              }
            });
          }
        };
        return e;
      })(d);
      var P = (function (t) {
        r(e, t);
        function e(n) {
          o(this, e);
          t.call(this);
          n = n || {};
          if (n.transform && typeof n.transform !== "string") {
            n = i({}, n, {
              transform: new E(n.transform),
            });
          }
          this._style = n;
        }
        e.prototype.__getValue = function t() {
          var e = {};
          for (var n in this._style) {
            var i = this._style[n];
            if (i instanceof _) {
              e[n] = i.__getValue();
            } else {
              e[n] = i;
            }
          }
          return e;
        };
        e.prototype.__getAnimatedValue = function t() {
          var e = {};
          for (var n in this._style) {
            var i = this._style[n];
            if (i instanceof _) {
              e[n] = i.__getAnimatedValue();
            }
          }
          return e;
        };
        e.prototype.__attach = function t() {
          for (var e in this._style) {
            var n = this._style[e];
            if (n instanceof _) {
              n.__addChild(this);
            }
          }
        };
        e.prototype.__detach = function t() {
          for (var e in this._style) {
            var n = this._style[e];
            if (n instanceof _) {
              n.__removeChild(this);
            }
          }
        };
        return e;
      })(d);
      var F = (function (t) {
        r(e, t);
        function e(n, r) {
          o(this, e);
          t.call(this);
          if (n.style) {
            n = i({}, n, {
              style: new P(n.style),
            });
          }
          this._props = n;
          this._callback = r;
          this.__attach();
        }
        e.prototype.__getValue = function t() {
          var e = {};
          for (var n in this._props) {
            var i = this._props[n];
            if (i instanceof _) {
              e[n] = i.__getValue();
            } else {
              e[n] = i;
            }
          }
          return e;
        };
        e.prototype.__getAnimatedValue = function t() {
          var e = {};
          for (var n in this._props) {
            var i = this._props[n];
            if (i instanceof _) {
              e[n] = i.__getAnimatedValue();
            }
          }
          return e;
        };
        e.prototype.__attach = function t() {
          for (var e in this._props) {
            var n = this._props[e];
            if (n instanceof _) {
              n.__addChild(this);
            }
          }
        };
        e.prototype.__detach = function t() {
          for (var e in this._props) {
            var n = this._props[e];
            if (n instanceof _) {
              n.__removeChild(this);
            }
          }
        };
        e.prototype.update = function t() {
          this._callback();
        };
        return e;
      })(_);
      var M = {
        boxFlex: true,
        boxFlexGroup: true,
        columnCount: true,
        flex: true,
        flexGrow: true,
        flexPositive: true,
        flexShrink: true,
        flexNegative: true,
        fontWeight: true,
        lineClamp: true,
        lineHeight: true,
        opacity: true,
        order: true,
        orphans: true,
        widows: true,
        zIndex: true,
        zoom: true,
        fillOpacity: true,
        strokeDashoffset: true,
        strokeOpacity: true,
        strokeWidth: true,
        matrix: true,
        matrix3d: true,
        scale: true,
        scale3d: true,
        scalex: true,
        scaley: true,
        scalez: true,
      };
      var U = {
        rotate: "deg",
        rotate3d: "deg",
        rotateX: "deg",
        rotateY: "deg",
        rotateZ: "deg",
        skew: "deg",
        skewX: "deg",
        skewY: "deg",
        translate: "px",
        translate3d: "px",
        translateX: "px",
        translateY: "px",
        translateZ: "px",
      };
      function I(t, e) {
        var n = e == null || typeof e === "boolean" || e === "";
        if (n) {
          return "";
        }
        var i = isNaN(e);
        if (i || e === 0 || (M.hasOwnProperty(t) && M[t])) {
          return "" + e;
        }
        if (typeof e === "string") {
          e = e.trim();
        }
        return e + (U[t] || "px");
      }
      function S(t) {
        if (typeof t === "string") {
          return t;
        } else {
          var e = [];
          for (var n = 0; n < t.length; n++) {
            for (var i in t[n]) {
              var r = t[n][i];
              if (r instanceof Array) {
                var o = [];
                for (var a = 0; a < r.length; a++) {
                  o.push(I(i, r[a]));
                }
                r = o.join(",");
              } else {
                r = I(i, r);
              }
              e.push(i + "(" + r + ")");
            }
          }
          return e.join(" ");
        }
      }
      var D = {
        clipPath: "clip-path",
        fillOpacity: "fill-opacity",
        markerEnd: "marker-end",
        markerMid: "marker-mid",
        markerStart: "marker-start",
        stopColor: "stop-color",
        stopOpacity: "stop-opacity",
        strokeDasharray: "stroke-dasharray",
        strokeDashoffset: "stroke-dashoffset",
        strokeLinecap: "stroke-linecap",
        strokeOpacity: "stroke-opacity",
        strokeWidth: "stroke-width",
        textAnchor: "text-anchor",
      };
      function L(t) {
        if (!t) {
          return t;
        }
        for (var e in t) {
          if (e === "transform") {
            t["transform"] = t["WebkitTransform"] = S(t[e]);
          } else {
            t[e] = I(e, t[e]);
          }
        }
        return t;
      }
      var W = {};
      function j(t) {
        var e = W[t];
        if (e) {
          return e;
        }
        var n = (function (e) {
          r(n, e);
          function n(t) {
            var i = this;
            o(this, n);
            e.call(this, t);
            this.refNode = function (t) {
              i.node = t;
            };
            this.callback = function () {
              var t = i.node;
              if (t) {
                var e = i._propsAnimated.__getAnimatedValue();
                for (var n in e) {
                  var r = e[n];
                  if (n === "style") {
                    for (var o in r) {
                      if (o === "transform") {
                        t.style["transform"] = t.style["WebkitTransform"] = S(
                          r[o],
                        );
                      } else {
                        t.style[o] = I(o, r[o]);
                      }
                    }
                  } else {
                    t.setAttribute(D[n] || n, r);
                  }
                }
              }
            };
          }
          n.prototype.componentWillUnmount = function t() {
            this._propsAnimated && this._propsAnimated.__detach();
          };
          n.prototype.UNSAFE_componentWillMount = function t() {
            this.attachProps(this.props);
          };
          n.prototype.attachProps = function t(e) {
            var n = this._propsAnimated;
            this._propsAnimated = new F(e, this.callback);
            n && n.__detach();
          };
          n.prototype.UNSAFE_componentWillReceiveProps = function t(e) {
            this.attachProps(e);
          };
          n.prototype.render = function e() {
            var n = this._propsAnimated.__getValue();
            if (n.style) {
              n.style = L(n.style);
            }
            return s.createElement(
              t,
              i({}, n, {
                ref: this.refNode,
              }),
            );
          };
          return n;
        })(s.Component);
        if (typeof t === "string") {
          W[t] = n;
        }
        return n;
      }
      var q = (function (t) {
        r(e, t);
        function e(n, i, r, a, s) {
          o(this, e);
          t.call(this);
          this._value = n;
          this._parent = i;
          this._animationClass = r;
          this._animationConfig = a;
          this._callback = s;
          this.__attach();
        }
        e.prototype.__getValue = function t() {
          return this._parent.__getValue();
        };
        e.prototype.__attach = function t() {
          this._parent.__addChild(this);
        };
        e.prototype.__detach = function t() {
          this._parent.__removeChild(this);
        };
        e.prototype.update = function t() {
          this._value.animate(
            new this._animationClass(
              i({}, this._animationConfig, {
                toValue: this._animationConfig.toValue.__getValue(),
              }),
            ),
            this._callback,
          );
        };
        return e;
      })(_);
      var z = function t(e, n) {
        return new C(e, n);
      };
      var N = function t(e, n) {
        return new T(e, n);
      };
      var R = function t(e, n, r) {
        if (e instanceof k) {
          var o = i({}, n);
          var a = i({}, n);
          for (var s in n) {
            var u = n[s];
            var f = u.x;
            var h = u.y;
            if (f !== undefined && h !== undefined) {
              o[s] = f;
              a[s] = h;
            }
          }
          var c = r(e.x, o);
          var l = r(e.y, a);
          return Z([c, l], {
            stopTogether: false,
          });
        }
        return null;
      };
      var X = function t(e, n) {
        return (
          R(e, n, t) || {
            start: function t(i) {
              if (false) {
              }
              var r = e;
              var o = n;
              r.stopTracking();
              if (n.toValue instanceof _) {
                r.track(new q(r, n.toValue, b, o, i));
              } else {
                r.animate(new b(o), i);
              }
            },
            stop: function t() {
              e.stopAnimation();
            },
          }
        );
      };
      var Y = function t(e, n) {
        return (
          R(e, n, t) || {
            start: function t(i) {
              if (false) {
              }
              var r = e;
              var o = n;
              r.stopTracking();
              if (n.toValue instanceof _) {
                r.track(new q(r, n.toValue, y, o, i));
              } else {
                r.animate(new y(o), i);
              }
            },
            stop: function t() {
              e.stopAnimation();
            },
          }
        );
      };
      var B = function t(e, n) {
        return (
          R(e, n, t) || {
            start: function t(i) {
              if (false) {
              }
              var r = e;
              var o = n;
              r.stopTracking();
              r.animate(new g(o), i);
            },
            stop: function t() {
              e.stopAnimation();
            },
          }
        );
      };
      var G = function t(e) {
        var n = 0;
        return {
          start: function t(i) {
            if (false) {
            }
            var r = function t(r) {
              if (!r.finished) {
                i && i(r);
                return;
              }
              n++;
              if (n === e.length) {
                i && i(r);
                return;
              }
              e[n].start(t);
            };
            if (e.length === 0) {
              i &&
                i({
                  finished: true,
                });
            } else {
              e[n].start(r);
            }
          },
          stop: function t() {
            if (n < e.length) {
              e[n].stop();
            }
          },
        };
      };
      var Z = function t(e, n) {
        var i = 0;
        var r = {};
        var o = !(n && n.stopTogether === false);
        var a = {
          start: function t(n) {
            if (false) {
            }
            if (i === e.length) {
              n &&
                n({
                  finished: true,
                });
              return;
            }
            e.forEach(function (t, s) {
              var u = function t(u) {
                r[s] = true;
                i++;
                if (i === e.length) {
                  i = 0;
                  n && n(u);
                  return;
                }
                if (!u.finished && o) {
                  a.stop();
                }
              };
              if (!t) {
                u({
                  finished: true,
                });
              } else {
                t.start(u);
              }
            });
          },
          stop: function t() {
            e.forEach(function (t, e) {
              !r[e] && t.stop();
              r[e] = true;
            });
          },
        };
        return a;
      };
      var H = function t(e) {
        return Y(new x(0), {
          toValue: 0,
          delay: e,
          duration: 0,
        });
      };
      var J = function t(e, n) {
        return Z(
          n.map(function (t, n) {
            return G([H(e * n), t]);
          }),
        );
      };
      var K = function t(e, n) {
        return function () {
          for (var t = arguments.length, i = Array(t), r = 0; r < t; r++) {
            i[r] = arguments[r];
          }
          var o = function t(e, n, i) {
            if (typeof n === "number") {
              !(e instanceof x) ? (false ? 0 : h(false)) : undefined;
              e.setValue(n);
              return;
            }
            !(typeof e === "object") ? (false ? 0 : h(false)) : undefined;
            !(typeof n === "object") ? (false ? 0 : h(false)) : undefined;
            for (var i in e) {
              t(e[i], n[i], i);
            }
          };
          e.forEach(function (t, e) {
            o(t, i[e], "arg" + e);
          });
          if (n && n.listener) {
            n.listener.apply(null, i);
          }
        };
      };
      t.exports = {
        Value: x,
        ValueXY: k,
        ValueList: O,
        decay: B,
        timing: Y,
        spring: X,
        add: z,
        multiply: N,
        delay: H,
        sequence: G,
        parallel: Z,
        stagger: J,
        event: K,
        createAnimatedComponent: j,
        div: j("div"),
        span: j("span"),
        img: j("img"),
        Easing: a,
        __PropsOnlyForTests: F,
      };
    },
    970076: function (t, e, n) {
      function i(t, e) {
        if (!(t instanceof e)) {
          throw new TypeError("Cannot call a class as a function");
        }
      }
      var r = n(842378);
      var o = (function () {
        function t() {
          i(this, t);
        }
        t.step0 = function t(e) {
          return e > 0 ? 1 : 0;
        };
        t.step1 = function t(e) {
          return e >= 1 ? 1 : 0;
        };
        t.linear = function t(e) {
          return e;
        };
        t.ease = function t(e) {
          return a(e);
        };
        t.quad = function t(e) {
          return e * e;
        };
        t.cubic = function t(e) {
          return e * e * e;
        };
        t.poly = function t(e) {
          return function (t) {
            return Math.pow(t, e);
          };
        };
        t.sin = function t(e) {
          return 1 - Math.cos((e * Math.PI) / 2);
        };
        t.circle = function t(e) {
          return 1 - Math.sqrt(1 - e * e);
        };
        t.exp = function t(e) {
          return Math.pow(2, 10 * (e - 1));
        };
        t.elastic = function t() {
          var e =
            arguments.length <= 0 || arguments[0] === undefined
              ? 1
              : arguments[0];
          var n = e * Math.PI;
          return function (t) {
            return (
              1 - Math.pow(Math.cos((t * Math.PI) / 2), 3) * Math.cos(t * n)
            );
          };
        };
        t.back = function t(e) {
          if (e === undefined) {
            e = 1.70158;
          }
          return function (t) {
            return t * t * ((e + 1) * t - e);
          };
        };
        t.bounce = function t(e) {
          if (e < 1 / 2.75) {
            return 7.5625 * e * e;
          }
          if (e < 2 / 2.75) {
            e -= 1.5 / 2.75;
            return 7.5625 * e * e + 0.75;
          }
          if (e < 2.5 / 2.75) {
            e -= 2.25 / 2.75;
            return 7.5625 * e * e + 0.9375;
          }
          e -= 2.625 / 2.75;
          return 7.5625 * e * e + 0.984375;
        };
        t.bezier = function t(e, n, i, o) {
          return r(e, n, i, o);
        };
        t["in"] = function t(e) {
          return e;
        };
        t.out = function t(e) {
          return function (t) {
            return 1 - e(1 - t);
          };
        };
        t.inOut = function t(e) {
          return function (t) {
            if (t < 0.5) {
              return e(t * 2) / 2;
            }
            return 1 - e((1 - t) * 2) / 2;
          };
        };
        return t;
      })();
      var a = o.bezier(0.42, 0, 1, 1);
      t.exports = o;
    },
    21849: function (t) {
      function e() {
        this._cache = [];
      }
      e.prototype.add = function (t) {
        if (this._cache.indexOf(t) === -1) {
          this._cache.push(t);
        }
      };
      e.prototype.forEach = function (t) {
        this._cache.forEach(t);
      };
      t.exports = e;
    },
    648882: function (t) {
      function e(t) {
        return (t - 30) * 3.62 + 194;
      }
      function n(t) {
        return (t - 8) * 3 + 25;
      }
      function i(t, i) {
        return {
          tension: e(t),
          friction: n(i),
        };
      }
      function r(t, i) {
        function r(t, e, n) {
          return (t - e) / (n - e);
        }
        function o(t, e, n) {
          return e + t * (n - e);
        }
        function a(t, e, n) {
          return t * n + (1 - t) * e;
        }
        function s(t, e, n) {
          return a(2 * t - t * t, e, n);
        }
        function u(t) {
          return (
            7e-4 * Math.pow(t, 3) - 0.031 * Math.pow(t, 2) + 0.64 * t + 1.28
          );
        }
        function f(t) {
          return 44e-6 * Math.pow(t, 3) - 0.006 * Math.pow(t, 2) + 0.36 * t + 2;
        }
        function h(t) {
          return (
            45e-8 * Math.pow(t, 3) - 332e-6 * Math.pow(t, 2) + 0.1078 * t + 5.84
          );
        }
        function c(t) {
          if (t <= 18) {
            return u(t);
          } else if (t > 18 && t <= 44) {
            return f(t);
          } else {
            return h(t);
          }
        }
        var l = r(t / 1.7, 0, 20);
        l = o(l, 0, 0.8);
        var _ = r(i / 1.7, 0, 20);
        var p = o(_, 0.5, 200);
        var d = s(l, c(p), 0.01);
        return {
          tension: e(p),
          friction: n(d),
        };
      }
      t.exports = {
        fromOrigamiTensionAndFriction: i,
        fromBouncinessAndSpeed: r,
      };
    },
    842378: function (t) {
      var e = 4;
      var n = 0.001;
      var i = 1e-7;
      var r = 10;
      var o = 11;
      var a = 1 / (o - 1);
      var s = typeof Float32Array === "function";
      function u(t, e) {
        return 1 - 3 * e + 3 * t;
      }
      function f(t, e) {
        return 3 * e - 6 * t;
      }
      function h(t) {
        return 3 * t;
      }
      function c(t, e, n) {
        return ((u(e, n) * t + f(e, n)) * t + h(e)) * t;
      }
      function l(t, e, n) {
        return 3 * u(e, n) * t * t + 2 * f(e, n) * t + h(e);
      }
      function _(t, e, n, o, a) {
        var s,
          u,
          f = 0;
        do {
          u = e + (n - e) / 2;
          s = c(u, o, a) - t;
          if (s > 0) {
            n = u;
          } else {
            e = u;
          }
        } while (Math.abs(s) > i && ++f < r);
        return u;
      }
      function p(t, n, i, r) {
        for (var o = 0; o < e; ++o) {
          var a = l(n, i, r);
          if (a === 0) {
            return n;
          }
          var s = c(n, i, r) - t;
          n -= s / a;
        }
        return n;
      }
      t.exports = function t(e, i, r, u) {
        if (!(0 <= e && e <= 1 && 0 <= r && r <= 1)) {
          throw new Error("bezier x values must be in [0, 1] range");
        }
        var f = s ? new Float32Array(o) : new Array(o);
        if (e !== i || r !== u) {
          for (var h = 0; h < o; ++h) {
            f[h] = c(h * a, e, r);
          }
        }
        function d(t) {
          var i = 0;
          var s = 1;
          var u = o - 1;
          for (; s !== u && f[s] <= t; ++s) {
            i += a;
          }
          --s;
          var h = (t - f[s]) / (f[s + 1] - f[s]);
          var c = i + h * a;
          var d = l(c, e, r);
          if (d >= n) {
            return p(t, c, e, r);
          } else if (d === 0) {
            return c;
          } else {
            return _(t, i, i + a, e, r);
          }
        }
        return function t(n) {
          if (e === i && r === u) {
            return n;
          }
          if (n === 0) {
            return 0;
          }
          if (n === 1) {
            return 1;
          }
          return c(d(n), i, u);
        };
      };
    },
    975024: function (t, e, n) {
      var i =
        n.g.cancelAnimationFrame ||
        n.g.webkitCancelAnimationFrame ||
        n.g.mozCancelAnimationFrame ||
        n.g.oCancelAnimationFrame ||
        n.g.msCancelAnimationFrame;
      var r = i || n.g.clearTimeout;
      t.exports = r;
    },
    258061: function (t) {
      function e(t, e, n, i, r, o, a, s) {
        if (false) {
        }
        if (!t) {
          var u;
          if (e === undefined) {
            u = new Error(
              "Minified exception occurred; use the non-minified dev environment " +
                "for the full error message and additional helpful warnings.",
            );
          } else {
            var f = [n, i, r, o, a, s];
            var h = 0;
            u = new Error(
              e.replace(/%s/g, function () {
                return f[h++];
              }),
            );
            u.name = "Invariant Violation";
          }
          u.framesToPop = 1;
          throw u;
        }
      }
      t.exports = e;
    },
    773703: function (t, e, n) {
      var i =
        n.g.requestAnimationFrame ||
        n.g.webkitRequestAnimationFrame ||
        n.g.mozRequestAnimationFrame ||
        n.g.oRequestAnimationFrame ||
        n.g.msRequestAnimationFrame;
      var r = 0;
      var o =
        i ||
        function (t) {
          if (false) {
          }
          var e = Date.now();
          var i = Math.max(0, 16 - (e - r));
          r = e + i;
          return n.g.setTimeout(function () {
            t(Date.now());
          }, i);
        };
      if (i) {
        i(function () {});
      }
      t.exports = o;
    },
  },
]);
