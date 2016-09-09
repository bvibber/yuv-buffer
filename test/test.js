var YUVBuffer = require('../index.js'),
  assert = require('assert'),
  expect = require('chai').expect;

describe('YUVBuffer', function() {
  describe('#validateDimension', function() {
    context('when a valid positive integer', function() {
      it('should pass through input without throwing', function() {
        [1, 2, 100, 10000].forEach(function(sample) {
          expect(function() {
            YUVBuffer.validateDimension(sample);
          }).to.not.throw();
        });
      });
    });
    context('when 0 or a negative integer', function() {
      it('should throw', function() {
        [0, -1, -2, -100, -10000].forEach(function(sample) {
          expect(function() {
            YUVBuffer.validateDimension(sample);
          }).to.throw();
        });
      });
    });
    context('when non-integer-safe numbers', function() {
      it('should throw', function() {
        [0.5, -2.3, Math.PI, 2e56, Infinity, -Infinity, NaN].forEach(function(sample) {
          expect(function() {
            YUVBuffer.validateDimension(sample);
          }).to.throw();
        });
      });
    });
    context('when not even a number', function() {
      it('should throw', function() {
        [null, undefined, "barf", "24", {}, []].forEach(function(sample) {
          expect(function() {
            YUVBuffer.validateDimension(sample);
          }).to.throw();
        });
      });
    });
  }),
  describe('#suitableStride()', function() {
    context('for multiples of 4', function() {
      it('should return identity for multiples of 4', function() {
        [4, 8, 12, 16, 720, 1920, 3840].forEach(function(sample) {
          assert(YUVBuffer.suitableStride(sample) === sample);
        });
      });
    });
    context('for non-multiples of 4', function() {
      it('should return next mult of 4', function() {
        [[1, 4], [2, 4], [3, 4], [5, 8], [999, 1000]].forEach(function(sample) {
          var input = sample[0],
            output = sample[1];
          assert(YUVBuffer.suitableStride(input) === output);
        });
      });
    });
  });
});
